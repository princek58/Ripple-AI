import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { extractZip, ZipError, type ExtractResult } from '../analysis/zip/index.js';
import { parseGithubUrl, downloadGithubZip, GithubError } from '../analysis/github/index.js';
import type { Project } from '../types.js';
import { scanProjectFiles } from '../analysis/scanner/index.js';
import { buildGraph } from '../analysis/graphBuilder/index.js';
import { runAllChecks } from '../checks/index.js';
import config from '../config.js';
import { getDatabase } from '../db/connection.js';
import { ProjectsRepository } from '../db/projectsRepository.js';
import { ScansRepository } from '../db/scansRepository.js';
import { GraphRepository } from '../db/graphRepository.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { validate } from '../utils/validation.js';

const router = Router();

// Concurrency limiter for uploads: at most 2 concurrent uploads
let activeUploads = 0;
const MAX_CONCURRENT_UPLOADS = 2;

export function getActiveUploads(): number {
  return activeUploads;
}

export function setActiveUploads(count: number): void {
  activeUploads = count;
}

export function resetActiveUploads(): void {
  activeUploads = 0;
}

const projectIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Invalid project ID format, must be a UUID' }),
});

const filesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().optional(),
});

export interface ProcessProjectZipParams {
  tempZipPath: string;
  rawProjectName: string;
  extraScanNotes?: string | null;
}

export async function processProjectZip(
  params: ProcessProjectZipParams
): Promise<Project> {
  const { tempZipPath, rawProjectName, extraScanNotes } = params;
  const limits = config.upload;

  // Check first 2 bytes are ZIP signature 'PK' (0x50, 0x4B)
  try {
    const fd = fs.openSync(tempZipPath, 'r');
    const magic = Buffer.alloc(2);
    const bytesRead = fs.readSync(fd, magic, 0, 2, 0);
    fs.closeSync(fd);

    if (bytesRead < 2 || magic[0] !== 0x50 || magic[1] !== 0x4b) {
      throw new ZipError('ZIP_INVALID', 'Uploaded file is not a valid ZIP');
    }
  } catch (err: unknown) {
    if (err instanceof ZipError) throw err;
    throw new ZipError('ZIP_INVALID', 'Failed to inspect uploaded file');
  }

  // Set up project and extraction paths
  const projectId = crypto.randomUUID();
  const storageBase = path.resolve(config.storagePath);
  const tempExtractionDir = path.resolve(config.tempStoragePath, `extract_${projectId}`);
  const projectDir = path.resolve(storageBase, projectId);
  const projectFilesDir = path.resolve(projectDir, 'files');

  // Safety check: Ensure paths stay inside backend/storage
  if (
    !tempExtractionDir.startsWith(storageBase + path.sep) ||
    !projectDir.startsWith(storageBase + path.sep)
  ) {
    throw new ZipError('ZIP_UNSAFE_PATH', 'Invalid storage path');
  }

  // Extract ZIP
  let extractResult: ExtractResult;
  try {
    extractResult = await extractZip(tempZipPath, tempExtractionDir, limits);
  } catch (extractErr: unknown) {
    if (fs.existsSync(tempExtractionDir)) {
      fs.rmSync(tempExtractionDir, { recursive: true, force: true });
    }
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
    throw extractErr;
  }

  // Move extracted files to backend/storage/<projectId>/files/
  try {
    fs.mkdirSync(projectDir, { recursive: true });
    try {
      fs.renameSync(tempExtractionDir, projectFilesDir);
    } catch {
      // On Windows renameSync can occasionally fail with EPERM/EBUSY; fallback to copy + delete
      fs.cpSync(tempExtractionDir, projectFilesDir, { recursive: true });
      fs.rmSync(tempExtractionDir, { recursive: true, force: true });
    }
  } catch {
    if (fs.existsSync(tempExtractionDir)) {
      fs.rmSync(tempExtractionDir, { recursive: true, force: true });
    }
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
    throw new Error('STORAGE_ERROR');
  }

  // Sanitise project name from rawProjectName:
  // strip extension, allow letters, digits, space, dot, dash, underscore, max 80 chars, fallback "project"
  const nameWithoutExt = path.basename(rawProjectName, path.extname(rawProjectName));
  const sanitizedName = nameWithoutExt
    .replace(/[^a-zA-Z0-9 ._-]/g, '')
    .trim()
    .slice(0, 80)
    .trim();
  const projectName = sanitizedName || 'project';

  // Unique languages
  const languages = Array.from(new Set(extractResult.files.map((f) => f.language))).sort();
  const languagesJson = JSON.stringify(languages);

  // Skipped summary notes
  const skippedCategories: Record<string, number> = {};
  for (const item of extractResult.skipped) {
    const cat = item.reason.split(' ')[0] || item.reason;
    skippedCategories[cat] = (skippedCategories[cat] || 0) + 1;
  }
  let notes =
    extractResult.skippedCount > 0
      ? `Skipped ${extractResult.skippedCount} file(s): ` +
        Object.entries(skippedCategories)
          .map(([cat, count]) => `${cat} (${count})`)
          .join(', ')
      : null;

  if (extraScanNotes) {
    notes = notes ? `${notes}\n${extraScanNotes}` : extraScanNotes;
  }

  // Database save in single transaction
  const db = getDatabase();
  const repo = new ProjectsRepository(db);
  const scanId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    const project = repo.createWithScanAndFiles({
      project: {
        id: projectId,
        name: projectName,
        size_bytes: extractResult.totalBytes,
        file_count: extractResult.extractedCount,
        languages: languagesJson,
        created_at: now,
        last_scan_at: now,
      },
      scan: {
        id: scanId,
        started_at: now,
        finished_at: now,
        status: 'completed',
        files_total: extractResult.totalEntries,
        files_skipped: extractResult.skippedCount,
        notes,
      },
      files: extractResult.files.map((f) => ({
        id: crypto.randomUUID(),
        path: f.path,
        size: f.size,
        language: f.language,
        sensitive: f.sensitive,
      })),
    });

    return project;
  } catch {
    // On DB failure, delete project folder and leave no partial data
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
    throw new Error('DB_ERROR');
  }
}

// POST /api/projects - Upload ZIP and extract project
router.post('/projects', async (req: Request, res: Response) => {
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    if (!req.complete) {
      req.on('data', () => {});
      await new Promise<void>((resolve) => {
        req.on('end', () => resolve());
        req.on('error', () => resolve());
        req.resume();
      });
    }
    return sendError(res, 'Too many concurrent uploads', 429, 'TOO_MANY_UPLOADS');
  }

  activeUploads++;
  let tempFilePath: string | null = null;

  try {
    const limits = config.upload;

    // Ensure temp storage directory exists
    fs.mkdirSync(config.tempStoragePath, { recursive: true });

    const storage = multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, config.tempStoragePath);
      },
      filename: (_req, _file, cb) => {
        cb(null, `${crypto.randomUUID()}.tmp`);
      },
    });

    const upload = multer({
      storage,
      limits: {
        fileSize: limits.maxZipSizeBytes,
        files: 1,
      },
    }).single('file');

    try {
      await new Promise<void>((resolve, reject) => {
        upload(req, res, (err: unknown) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
    } catch (uploadErr: unknown) {
      if (uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE') {
        return sendError(
          res,
          `File size exceeds limit (${limits.maxZipSizeBytes} bytes)`,
          413,
          'FILE_TOO_LARGE'
        );
      }
      return sendError(res, 'Invalid file upload', 400, 'UPLOAD_ERROR');
    }

    if (!req.file) {
      return sendError(res, 'No file uploaded, expected multipart field "file"', 400, 'MISSING_FILE');
    }

    tempFilePath = req.file.path;

    try {
      const project = await processProjectZip({
        tempZipPath: tempFilePath,
        rawProjectName: req.file.originalname || '',
      });
      return sendSuccess(res, project, 201);
    } catch (err: unknown) {
      if (err instanceof ZipError) {
        const statusCode = err.code === 'ZIP_INVALID' ? 400 : 422;
        return sendError(res, err.message, statusCode, err.code);
      }
      if (err instanceof Error && err.message === 'STORAGE_ERROR') {
        return sendError(res, 'Failed to move extracted files to storage', 500, 'STORAGE_ERROR');
      }
      if (err instanceof Error && err.message === 'DB_ERROR') {
        return sendError(res, 'Failed to save project records to database', 500, 'DB_ERROR');
      }
      return sendError(res, 'Failed to extract ZIP archive', 400, 'ZIP_INVALID');
    }
  } finally {
    activeUploads--;
    const fileToUnlink = tempFilePath || (req as any).file?.path;
    if (fileToUnlink && fs.existsSync(fileToUnlink)) {
      try {
        fs.unlinkSync(fileToUnlink);
      } catch {
        // ignore unlink errors
      }
    }
  }
});

const importGithubBodySchema = z.object({
  url: z.string({ required_error: 'URL is required', invalid_type_error: 'URL must be a string' }),
});

// POST /api/projects/import-github - Download public GitHub repository ZIP and extract project
router.post(
  '/projects/import-github',
  validate({ body: importGithubBodySchema }),
  async (req: Request, res: Response) => {
    if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
      return sendError(res, 'Too many concurrent uploads', 429, 'TOO_MANY_UPLOADS');
    }

    activeUploads++;
    let tempZipPath: string | null = null;

    try {
      // 1. Parse and validate GitHub URL (pure check, no network request on invalid)
      const parsed = parseGithubUrl(req.body.url);

      // 2. Prepare isolated temporary storage path
      fs.mkdirSync(config.tempStoragePath, { recursive: true });
      tempZipPath = path.resolve(config.tempStoragePath, `${crypto.randomUUID()}.tmp`);

      // 3. Download repository ZIP from GitHub
      await downloadGithubZip(parsed, tempZipPath);

      // 4. Process ZIP through the shared pipeline
      const extraScanNotes = `Imported from github.com/${parsed.owner}/${parsed.repo} (public)`;
      const project = await processProjectZip({
        tempZipPath,
        rawProjectName: parsed.repo,
        extraScanNotes,
      });

      return sendSuccess(res, project, 201);
    } catch (err: unknown) {
      if (err instanceof GithubError) {
        switch (err.code) {
          case 'GITHUB_URL_INVALID':
            return sendError(res, 'Invalid GitHub repository link', 400, err.code);
          case 'GITHUB_REPO_NOT_FOUND':
            return sendError(res, err.message, 404, err.code);
          case 'GITHUB_REPO_TOO_LARGE':
            return sendError(res, 'Repository exceeds maximum size limit', 413, err.code);
          case 'GITHUB_UNAVAILABLE':
            return sendError(res, 'GitHub service is unavailable or rate limited', 502, err.code);
          case 'GITHUB_UNREACHABLE':
            return sendError(res, 'Unable to reach GitHub', 502, err.code);
          case 'GITHUB_REDIRECT_BLOCKED':
            return sendError(res, 'Download redirect was blocked', 502, err.code);
        }
      }

      if (err instanceof ZipError) {
        const statusCode = err.code === 'ZIP_INVALID' ? 400 : 422;
        return sendError(res, err.message, statusCode, err.code);
      }

      if (err instanceof Error && err.message === 'STORAGE_ERROR') {
        return sendError(res, 'Failed to store project files', 500, 'STORAGE_ERROR');
      }

      if (err instanceof Error && err.message === 'DB_ERROR') {
        return sendError(res, 'Failed to save project records to database', 500, 'DB_ERROR');
      }

      return sendError(res, 'Failed to import repository', 500, 'IMPORT_ERROR');
    } finally {
      activeUploads--;
      if (tempZipPath && fs.existsSync(tempZipPath)) {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            fs.unlinkSync(tempZipPath);
            break;
          } catch (e: any) {
            if (attempt < 4 && (e.code === 'EBUSY' || e.code === 'EPERM')) {
              const start = Date.now();
              while (Date.now() - start < 20) {}
            }
          }
        }
      }
    }
  }
);

// GET /api/projects - list projects, newest first
router.get('/projects', (_req: Request, res: Response) => {
  const db = getDatabase();
  const repo = new ProjectsRepository(db);
  const projects = repo.findAll();
  return sendSuccess(res, projects);
});

// GET /api/projects/:id - get single project
router.get(
  '/projects/:id',
  validate({ params: projectIdParamsSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDatabase();
    const repo = new ProjectsRepository(db);
    const project = repo.findById(id);

    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    return sendSuccess(res, project);
  }
);

// GET /api/projects/:id/files - list project files with pagination and search
router.get(
  '/projects/:id/files',
  validate({ params: projectIdParamsSchema, query: filesQuerySchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { page, pageSize, q } = req.query as unknown as {
      page: number;
      pageSize: number;
      q?: string;
    };

    const db = getDatabase();
    const repo = new ProjectsRepository(db);

    const project = repo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    const storageBase = path.resolve(config.storagePath);
    const projectFilesDir = path.resolve(storageBase, id, 'files');
    if (!fs.existsSync(projectFilesDir)) {
      return sendError(
        res,
        'Project files are missing. Upload the ZIP again',
        409,
        'PROJECT_FILES_MISSING'
      );
    }

    const filesResult = repo.findFiles(id, { page, pageSize, q });
    return sendSuccess(res, filesResult);
  }
);

// GET /api/projects/:id/tests - list project test runs
router.get(
  '/projects/:id/tests',
  validate({ params: projectIdParamsSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDatabase();
    const repo = new ProjectsRepository(db);

    const project = repo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    const testRuns = repo.getTestRuns(id);
    return sendSuccess(res, testRuns);
  }
);

// DELETE /api/projects/:id - delete project and its storage
router.delete(
  '/projects/:id',
  validate({ params: projectIdParamsSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDatabase();
    const repo = new ProjectsRepository(db);

    const project = repo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    // 1. Delete from database (foreign key cascade removes scans, project_files, nodes, etc.)
    repo.delete(id);

    // 2. Safely clean up storage folder under backend/storage/<id> if it exists
    const storageBase = path.resolve(config.storagePath);
    const projectStorageDir = path.resolve(storageBase, id);

    // Guard: Ensure directory is strictly within storageBase to prevent path traversal
    if (projectStorageDir.startsWith(storageBase + path.sep)) {
      if (fs.existsSync(projectStorageDir)) {
        fs.rmSync(projectStorageDir, { recursive: true, force: true });
      }
    }

    return sendSuccess(res, { id, deleted: true });
  }
);

// POST /api/projects/:id/scan - Scan project files and build dependency graph
router.post(
  '/projects/:id/scan',
  validate({ params: projectIdParamsSchema }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDatabase();
    const projectsRepo = new ProjectsRepository(db);
    const scansRepo = new ScansRepository(db);

    const project = projectsRepo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    const storageBase = path.resolve(config.storagePath);
    const projectFilesDir = path.resolve(storageBase, id, 'files');
    if (!fs.existsSync(projectFilesDir)) {
      return sendError(
        res,
        'Project files are missing. Upload the ZIP again',
        409,
        'PROJECT_FILES_MISSING'
      );
    }

    const scanId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    // 1. Create running scan record
    scansRepo.create({
      id: scanId,
      project_id: id,
      started_at: startedAt,
      status: 'running',
    });

    try {

      // 2. Scan project files safely
      const scannedFiles = scanProjectFiles(projectFilesDir, {
        maxSingleFileSizeBytes: config.upload.maxSingleFileSizeBytes,
      });

      // 3. Build graph
      const graphResult = buildGraph(scannedFiles, {
        projectId: id,
        scanId,
        projectName: project.name,
      });

      // 4. Run static analysis checks
      const checksResult = runAllChecks({
        projectId: id,
        scanId,
        nodes: graphResult.nodes,
        edges: graphResult.edges,
        files: scannedFiles,
      });

      const combinedNotes = `${graphResult.notes} ${checksResult.notesSummary}`.trim();
      const finishedAt = new Date().toISOString();

      // 5. Save graph and findings inside single transaction
      const completedScan = scansRepo.saveGraphTransaction(
        id,
        scanId,
        graphResult.nodes,
        graphResult.edges,
        {
          finished_at: finishedAt,
          status: 'completed',
          files_total: graphResult.filesTotal,
          files_skipped: graphResult.filesSkipped,
          notes: combinedNotes,
        },
        checksResult.findings
      );

      return sendSuccess(res, completedScan);
    } catch (err: unknown) {
      const finishedAt = new Date().toISOString();
      const message = err instanceof Error ? err.message : String(err);

      scansRepo.update(scanId, {
        finished_at: finishedAt,
        status: 'failed',
        files_total: 0,
        files_skipped: 0,
        notes: `Scan failed: ${message}`,
      });

      return sendError(res, `Scan failed: ${message}`, 500, 'SCAN_FAILED');
    }
  }
);

// GET /api/projects/:id/scans - List scans for a project, newest first
router.get(
  '/projects/:id/scans',
  validate({ params: projectIdParamsSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDatabase();
    const projectsRepo = new ProjectsRepository(db);
    const scansRepo = new ScansRepository(db);

    const project = projectsRepo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    const scans = scansRepo.findByProjectId(id);
    return sendSuccess(res, scans);
  }
);

const graphQuerySchema = z
  .object({
    level: z.coerce.number().int().min(1).max(3).default(1),
    focus: z.string().uuid({ message: 'Invalid focus ID format, must be a UUID' }).optional(),
    depth: z.coerce.number().int().min(1).max(3).default(1),
    maxNodes: z.coerce.number().int().min(1).max(500).default(200),
  })
  .refine(
    (data) => {
      if ((data.level === 2 || data.level === 3) && !data.focus) {
        return false;
      }
      return true;
    },
    {
      message: 'focus parameter is required for level 2 and level 3',
      path: ['focus'],
    }
  );

const graphSearchQuerySchema = z.object({
  q: z.string().optional(),
  type: z.enum(['project', 'module', 'frontend', 'backend', 'api', 'database', 'config', 'test']).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'unknown']).optional(),
  verification: z.enum(['not_tested', 'reproduced', 'fix_proposed', 'fix_verified']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const nodeDetailsParamsSchema = z.object({
  id: z.string().uuid({ message: 'Invalid project ID format, must be a UUID' }),
  nodeId: z.string().uuid({ message: 'Invalid node ID format, must be a UUID' }),
});

const impactQuerySchema = z.object({
  node: z.string().uuid({ message: 'Invalid node ID format, must be a UUID' }),
  depth: z.coerce.number().int().min(1).max(10).default(10),
  maxNodes: z.coerce.number().int().min(1).max(500).default(300),
});

// GET /api/projects/:id/graph/search - Search nodes with filters
router.get(
  '/projects/:id/graph/search',
  validate({ params: projectIdParamsSchema, query: graphSearchQuerySchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { q, type, severity, verification, limit, offset } = req.query as any;

    const db = getDatabase();
    const projectsRepo = new ProjectsRepository(db);
    const graphRepo = new GraphRepository(db);

    const project = projectsRepo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    const result = graphRepo.search(id, {
      q,
      type,
      severity,
      verification,
      limit,
      offset,
    });

    return sendSuccess(res, result);
  }
);

// GET /api/projects/:id/graph/nodes/:nodeId - Detailed node view with connections
router.get(
  '/projects/:id/graph/nodes/:nodeId',
  validate({ params: nodeDetailsParamsSchema }),
  (req: Request, res: Response) => {
    const { id, nodeId } = req.params;

    const db = getDatabase();
    const projectsRepo = new ProjectsRepository(db);
    const graphRepo = new GraphRepository(db);

    const project = projectsRepo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    const result = graphRepo.getNodeDetails(id, nodeId);
    if (!result) {
      return sendError(res, 'Node not found', 404);
    }

    return sendSuccess(res, result);
  }
);

// GET /api/projects/:id/graph - Level 1, Level 2, or Level 3 graph view
router.get(
  '/projects/:id/graph',
  validate({ params: projectIdParamsSchema, query: graphQuerySchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { level, focus, depth, maxNodes } = req.query as any;

    const db = getDatabase();
    const projectsRepo = new ProjectsRepository(db);
    const graphRepo = new GraphRepository(db);

    const project = projectsRepo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    let result = null;
    if (level === 1) {
      result = graphRepo.getLevel1(id, maxNodes);
    } else if (level === 2) {
      result = graphRepo.getLevel2(id, focus, maxNodes);
    } else if (level === 3) {
      result = graphRepo.getLevel3(id, focus, depth, maxNodes);
    }

    if (!result) {
      return sendError(res, 'Graph node not found in project', 404);
    }

    return sendSuccess(res, result);
  }
);

// GET /api/projects/:id/impact - Change impact analysis for a node
router.get(
  '/projects/:id/impact',
  validate({ params: projectIdParamsSchema, query: impactQuerySchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { node, depth, maxNodes } = req.query as unknown as {
      node: string;
      depth: number;
      maxNodes: number;
    };

    const db = getDatabase();
    const projectsRepo = new ProjectsRepository(db);
    const graphRepo = new GraphRepository(db);

    const project = projectsRepo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    // Check if project has undergone a real analysis scan (SAME never-scanned rule as reports route)
    const { nodeCount } = db
      .prepare('SELECT COUNT(*) as nodeCount FROM nodes WHERE project_id = ?')
      .get(id) as { nodeCount: number };

    if (nodeCount === 0) {
      return sendError(res, 'Scan the project first [SCAN_REQUIRED]', 409, 'SCAN_REQUIRED');
    }

    // Check node exists globally and in this project
    const rawNode = db
      .prepare('SELECT id, project_id, type FROM nodes WHERE id = ?')
      .get(node) as { id: string; project_id: string; type: string } | undefined;

    if (!rawNode || rawNode.project_id !== id) {
      return sendError(res, 'Node not found', 404);
    }

    // Module nodes are not supported as start node in Phase 2 feature A
    if (rawNode.type === 'module' || rawNode.type === 'project') {
      return sendError(
        res,
        'Choose a file, API or config node [IMPACT_NODE_UNSUPPORTED]',
        400,
        'IMPACT_NODE_UNSUPPORTED'
      );
    }

    const result = graphRepo.getImpact(id, node, { depth, maxNodes });
    if (!result) {
      return sendError(res, 'Node not found', 404);
    }

    return sendSuccess(res, result);
  }
);

export default router;
