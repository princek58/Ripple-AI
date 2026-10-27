import express from 'express';
import config from './config.js';
import fs from 'node:fs';
import path from 'node:path';
import accessRouter from './routes/access.js';
import healthRouter from './routes/health.js';
import projectsRouter from './routes/projects.js';
import findingsRouter from './routes/findings.js';
import fixesRouter from './routes/fixes.js';
import reportsRouter from './routes/reports.js';
import aiRouter from './routes/ai.js';
import { authMiddleware } from './middleware/auth.js';
import { notFoundHandler, errorHandler } from './utils/errors.js';

const app = express();

// Trust proxy if configured in environment
if (config.trustProxy) {
  app.set(
    'trust proxy',
    config.trustProxy === 'true' || config.trustProxy === '1' ? true : config.trustProxy
  );
}

// Request size limit for JSON bodies
app.use(express.json({ limit: config.jsonBodyLimit }));

// CORS: same-origin in production unless CORS_ORIGIN is explicitly set
app.use((req, res, next) => {
  const allowedOrigin = config.corsOrigin;
  const origin = req.headers.origin;

  if (origin && (allowedOrigin === '*' || origin === allowedOrigin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else if (!origin && allowedOrigin) {
    res.header('Access-Control-Allow-Origin', allowedOrigin);
  }

  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Authentication Gate Middleware (enforced if APP_ACCESS_CODE is set)
app.use(authMiddleware);

// API Routes
app.use('/api', accessRouter);
app.use('/api', healthRouter);
app.use('/api', projectsRouter);
app.use('/api', findingsRouter);
app.use('/api', fixesRouter);
app.use('/api', reportsRouter);
app.use('/api', aiRouter);

// Unknown /api routes always keep JSON 404
app.all('/api/*', notFoundHandler);

// Production frontend static file serving
app.use((req, res, next) => {
  if (config.nodeEnv !== 'production') return next();
  const distPath = config.frontendDistPath;
  if (!fs.existsSync(distPath)) return next();

  express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      const base = path.basename(filePath);
      if (base === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes('assets')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  })(req, res, next);
});

// SPA fallback for all non-/api GET requests in production
app.get('*', (req, res, next) => {
  if (config.nodeEnv !== 'production') return next();
  const distPath = config.frontendDistPath;
  if (!fs.existsSync(distPath)) return next();

  if (req.path.startsWith('/api')) {
    return next();
  }

  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(indexPath);
  }
  next();
});

// 404 Handler for undefined routes
app.use(notFoundHandler);

// Central error handler (never leaks stack traces or file paths)
app.use(errorHandler);

export default app;
