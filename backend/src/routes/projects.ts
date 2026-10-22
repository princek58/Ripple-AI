import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ProjectsRepository } from '../db/projectsRepository.js';
import { getDatabase } from '../db/connection.js';
import config from '../config.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { validate } from '../utils/validation.js';

const router = Router();

const projectIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Invalid project ID format, must be a UUID' }),
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

    // 1. Delete from database (foreign key cascade removes scans, nodes, edges, findings, etc.)
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

export default router;
