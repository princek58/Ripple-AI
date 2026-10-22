import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { extractZip, ZipError, type ExtractResult } from '../analysis/zip/index.js';
import { scanProjectFiles } from '../analysis/scanner/index.js';
import { buildGraph } from '../analysis/graphBuilder/index.js';
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

    // Check first 2 bytes are ZIP signature 'PK' (0x50, 0x4B)
    try {
      const fd = fs.openSync(tempFilePath, 'r');
      const magic = Buffer.alloc(2);
      const bytesRead = fs.readSync(fd, magic, 0, 2, 0);
      fs.closeSync(fd);

      if (bytesRead < 2 || magic[0] !== 0x50 || magic[1] !== 0x4b) {
        return sendError(res, 'Uploaded file is not a valid ZIP', 400, 'ZIP_INVALID');
      }
    } catch {
      return sendError(res, 'Failed to inspect uploaded file', 400, 'ZIP_INVALID');
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
      return sendError(res, 'Invalid storage path', 400, 'ZIP_UNSAFE_PATH');
    }

    // Extract ZIP
    let extractResult: ExtractResult;
    try {
      extractResult = await extractZip(tempFilePath, tempExtractionDir, limits);
    } catch (extractErr: unknown) {
      if (fs.existsSync(tempExtractionDir)) {
        fs.rmSync(tempExtractionDir, { recursive: true, force: true });
      }
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }

      if (extractErr instanceof ZipError) {
        const statusCode = extractErr.code === 'ZIP_INVALID' ? 400 : 422;
        return sendError(res, extractErr.message, statusCode, extractErr.code);
      }
      return sendError(res, 'Failed to extract ZIP archive', 400, 'ZIP_INVALID');
    }

    // Move extracted files atomically to backend/storage/<projectId>/files/
    try {
      fs.mkdirSync(projectDir, { recursive: true });
      fs.renameSync(tempExtractionDir, projectFilesDir);
    } catch {
      if (fs.existsSync(tempExtractionDir)) {
        fs.rmSync(tempExtractionDir, { recursive: true, force: true });
      }
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      return sendError(res, 'Failed to move extracted files to storage', 500, 'STORAGE_ERROR');
    }

    // Sanitise project name from ZIP filename:
    // strip extension, allow letters, digits, space, dot, dash, underscore, max 80 chars, fallback "project"
    const originalName = req.file.originalname || '';
    const nameWithoutExt = path.basename(originalName, path.extname(originalName));
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
    const notes =
      extractResult.skippedCount > 0
        ? `Skipped ${extractResult.skippedCount} file(s): ` +
          Object.entries(skippedCategories)
            .map(([cat, count]) => `${cat} (${count})`)
            .join(', ')
        : null;

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

      return sendSuccess(res, project, 201);
    } catch {
      // On DB failure, delete project folder and leave no partial data
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      return sendError(res, 'Failed to save project records to database', 500, 'DB_ERROR');
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

    const filesResult = repo.findFiles(id, { page, pageSize, q });
    return sendSuccess(res, filesResult);
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
      const storageBase = path.resolve(config.storagePath);
      const projectFilesDir = path.resolve(storageBase, id, 'files');

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

      const finishedAt = new Date().toISOString();

      // 4. Save graph and mark scan completed inside single transaction
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
          notes: graphResult.notes,
        }
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

export default router;
