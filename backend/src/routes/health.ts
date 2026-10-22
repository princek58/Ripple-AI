import { Router, Request, Response } from 'express';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    data: { status: 'ok' },
    error: null,
  });
});

export default router;
