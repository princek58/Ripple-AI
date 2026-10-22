import type { Request, Response, NextFunction } from 'express';
import { sendError } from './response.js';

export function notFoundHandler(_req: Request, res: Response) {
  return sendError(res, 'Route not found', 404);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  // Handle JSON parse errors from express.json()
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    return sendError(res, 'Invalid JSON body', 400);
  }

  // Handle SQLite constraint violations cleanly without file path leaks
  if (err instanceof Error) {
    if (err.message.includes('CHECK constraint failed')) {
      return sendError(res, 'Constraint violation: invalid value for database column', 400);
    }
    if (err.message.includes('FOREIGN KEY constraint failed')) {
      return sendError(res, 'Constraint violation: referenced entity does not exist', 400);
    }
  }

  // Never leak internal stack traces or file paths to clients
  return sendError(res, 'Internal server error', 500);
}
