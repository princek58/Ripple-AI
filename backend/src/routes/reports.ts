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

    const markdown = generateMarkdownReport(db, id);
    const report = reportsRepo.create(id, markdown);

    return sendSuccess(res, report, 201);
  }
);

// GET /api/projects/:id/reports - List reports for a project, newest first
router.get(
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

    const reports = reportsRepo.findByProjectId(id);
    return sendSuccess(res, reports);
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
