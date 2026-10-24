import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { ProjectsRepository } from '../db/projectsRepository.js';
import { ReportsRepository } from '../db/reportsRepository.js';
import { generateMarkdownReport } from '../services/reportGenerator.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { validate } from '../utils/validation.js';

const router = Router();

const uuidParamSchema = z.object({
  id: z.string().uuid({ message: 'Invalid ID format, must be a UUID' }),
});

const getReportQuerySchema = z.object({
  format: z.string().optional(),
});

const listReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// POST /api/projects/:id/reports - Generate and save a markdown report
router.post(
  '/projects/:id/reports',
  validate({ params: uuidParamSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDatabase();
    const projectsRepo = new ProjectsRepository(db);
    const reportsRepo = new ReportsRepository(db);

    const project = projectsRepo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    // Check if project has undergone a real analysis scan:
    // Exactly as summary endpoint calculates node count from nodes table:
    const { nodeCount } = db
      .prepare('SELECT COUNT(*) as nodeCount FROM nodes WHERE project_id = ?')
      .get(id) as { nodeCount: number };

    if (nodeCount === 0) {
      return sendError(res, 'Scan the project first [SCAN_REQUIRED]', 409, 'SCAN_REQUIRED');
    }

    const markdown = generateMarkdownReport(db, id);
    const report = reportsRepo.create(id, markdown);

    return sendSuccess(res, report, 201);
  }
);

// GET /api/projects/:id/reports - List reports for a project, newest first (paginated, no markdown)
router.get(
  '/projects/:id/reports',
  validate({ params: uuidParamSchema, query: listReportsQuerySchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const db = getDatabase();
    const projectsRepo = new ProjectsRepository(db);
    const reportsRepo = new ReportsRepository(db);

    const project = projectsRepo.findById(id);
    if (!project) {
      return sendError(res, 'Project not found', 404);
    }

    const result = reportsRepo.findByProjectId(id, { page, pageSize });
    return sendSuccess(res, result);
  }
);

// GET /api/reports/:id - Get report as JSON or text/markdown if ?format=md
router.get(
  '/reports/:id',
  validate({ params: uuidParamSchema, query: getReportQuerySchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { format } = req.query as unknown as { format?: string };
    const db = getDatabase();
    const reportsRepo = new ReportsRepository(db);

    const report = reportsRepo.findById(id);
    if (!report) {
      return sendError(res, 'Report not found', 404);
    }

    if (format === 'md') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      return res.status(200).send(report.markdown);
    }

    return sendSuccess(res, report);
  }
);

export default router;
