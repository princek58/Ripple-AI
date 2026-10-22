import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { FindingsRepository } from '../db/findingsRepository.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { validate } from '../utils/validation.js';

const router = Router();

const projectIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Invalid project ID format, must be a UUID' }),
});

const findingIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Invalid finding ID format, must be a UUID' }),
});

const listFindingsQuerySchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low', 'unknown']).optional(),
  confidence: z.enum(['confirmed', 'likely', 'hypothesis']).optional(),
  verification: z.enum(['not_tested', 'reproduced', 'fix_proposed', 'fix_verified']).optional(),
  rule_id: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// GET /api/projects/:id/findings - Paginated list of findings with filters
router.get(
  '/projects/:id/findings',
  validate({ params: projectIdParamsSchema, query: listFindingsQuerySchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const { severity, confidence, verification, rule_id, q, page, pageSize } = req.query as any;

    const db = getDatabase();
    const findingsRepo = new FindingsRepository(db);

    const result = findingsRepo.findByProjectId(id, {
      severity,
      confidence,
      verification,
      rule_id,
      q,
      page,
      pageSize,
    });

    if (!result) {
      return sendError(res, 'Project not found', 404);
    }

    return sendSuccess(res, result);
  }
);

// GET /api/findings/:id - Details of a single finding with associated nodes
router.get(
  '/findings/:id',
  validate({ params: findingIdParamsSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;

    const db = getDatabase();
    const findingsRepo = new FindingsRepository(db);

    const result = findingsRepo.findById(id);
    if (!result) {
      return sendError(res, 'Finding not found', 404);
    }

    return sendSuccess(res, result);
  }
);

// GET /api/projects/:id/summary - Overview KPI and findings breakdown
router.get(
  '/projects/:id/summary',
  validate({ params: projectIdParamsSchema }),
  (req: Request, res: Response) => {
    const { id } = req.params;

    const db = getDatabase();
    const findingsRepo = new FindingsRepository(db);

    const result = findingsRepo.getSummary(id);
    if (!result) {
      return sendError(res, 'Project not found', 404);
    }

    return sendSuccess(res, result);
  }
);

export default router;
