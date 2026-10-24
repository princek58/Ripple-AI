import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import config from '../config.js';
import { getDatabase } from '../db/connection.js';
import { FixesRepository } from '../db/fixesRepository.js';
import { ProjectsRepository } from '../db/projectsRepository.js';
import { generateFixForFinding } from '../services/fixGenerator.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { validate } from '../utils/validation.js';

const router = Router();

const uuidParamSchema = z.object({
  id: z.string().uuid({ message: 'Invalid ID format, must be a UUID' }),
});

const listProjectFixesQuerySchema = z.object({
  status: z.enum(['proposed', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// POST /api/findings/:id/fixes - Generate or return existing proposed fix
router.post(
  '/findings/:id/fixes',
  validate({ params: uuidParamSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDatabase();
    const fixesRepo = new FixesRepository(db);

    const finding = db.prepare('SELECT * FROM findings WHERE id = ?').get(id) as any;
    if (!finding) {
      return sendError(res, 'Finding not found', 404);
    }

    const storageBase = path.resolve(config.storagePath);
    const projectFilesDir = path.resolve(storageBase, finding.project_id, 'files');
    if (!fs.existsSync(projectFilesDir)) {
      return sendError(
        res,
        'Project files are missing. Upload the ZIP again',
        409,
        'PROJECT_FILES_MISSING'
      );
    }

    // Return existing open proposed fix if present
    const existingFix = fixesRepo.findProposedByFindingId(id);
    if (existingFix) {
      return sendSuccess(res, existingFix, 200);
    }

    // Generate fix via deterministic templates
    const result = generateFixForFinding(db, finding);
    if (!result.success || !result.fix) {
      return sendError(
        res,
        result.errorMessage || 'No automatic fix available for this finding',
        422,
        result.errorCode || 'NO_AUTOMATIC_FIX'
      );
    }

    const fixId = crypto.randomUUID();
    const newFix = fixesRepo.createFix({
      id: fixId,
      finding_id: finding.id,
      diff_text: result.fix.diffText,
      files_json: JSON.stringify(result.fix.files),
      status: 'proposed',
    });

    return sendSuccess(res, newFix, 201);
  }
);

// GET /api/findings/:id/fixes - List fixes of a finding
router.get(
  '/findings/:id/fixes',
  validate({ params: uuidParamSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDatabase();
    const fixesRepo = new FixesRepository(db);

    const finding = db.prepare('SELECT id FROM findings WHERE id = ?').get(id);
    if (!finding) {
      return sendError(res, 'Finding not found', 404);
    }

    const fixes = fixesRepo.findByFindingId(id);
    return sendSuccess(res, fixes);
  }
);

// GET /api/projects/:id/fixes - List fixes of a project with finding details
router.get(
  '/projects/:id/fixes',
  validate({ params: uuidParamSchema, query: listProjectFixesQuerySchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, page, pageSize } = req.query as unknown as {
      status?: string;
      page: number;
      pageSize: number;
    };

    const db = getDatabase();
    const projectsRepo = new ProjectsRepository(db);
    const fixesRepo = new FixesRepository(db);

    const project = projectsRepo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    const result = fixesRepo.findByProjectId(id, { status, page, pageSize });
    return sendSuccess(res, result);
  }
);

// POST /api/fixes/:id/approve - Approve a proposed fix and write .patch file
router.post(
  '/fixes/:id/approve',
  validate({ params: uuidParamSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDatabase();
    const fixesRepo = new FixesRepository(db);

    const fix = fixesRepo.findById(id);
    if (!fix) {
      return sendError(res, 'Fix not found', 404);
    }

    if (fix.status !== 'proposed') {
      return sendError(res, 'Fix has already been resolved', 409, 'FIX_ALREADY_RESOLVED');
    }

    // Write .patch file under backend/storage/<projectId>/patches/<fixId>.patch
    const storageBase = path.resolve(config.storagePath);
    const patchesDir = path.resolve(storageBase, fix.project_id, 'patches');
    if (!patchesDir.startsWith(storageBase + path.sep)) {
      return sendError(res, 'Unsafe storage path for patch directory', 500, 'STORAGE_ERROR');
    }

    fs.mkdirSync(patchesDir, { recursive: true });
    const patchFilePath = path.resolve(patchesDir, `${fix.id}.patch`);
    if (!patchFilePath.startsWith(patchesDir + path.sep)) {
      return sendError(res, 'Unsafe storage path for patch file', 500, 'STORAGE_ERROR');
    }

    // Write unified diff only
    fs.writeFileSync(patchFilePath, fix.diff_text, 'utf-8');

    const updatedFix = fixesRepo.approveFix(id);
    const patchRelPath = `patches/${fix.id}.patch`;

    return sendSuccess(res, {
      ...updatedFix,
      patch_path: patchRelPath,
    });
  }
);

// POST /api/fixes/:id/reject - Reject a proposed fix
router.post(
  '/fixes/:id/reject',
  validate({ params: uuidParamSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDatabase();
    const fixesRepo = new FixesRepository(db);

    const fix = fixesRepo.findById(id);
    if (!fix) {
      return sendError(res, 'Fix not found', 404);
    }

    if (fix.status !== 'proposed') {
      return sendError(res, 'Fix has already been resolved', 409, 'FIX_ALREADY_RESOLVED');
    }

    const updatedFix = fixesRepo.rejectFix(id, fix.finding_id);
    return sendSuccess(res, updatedFix);
  }
);

export default router;
