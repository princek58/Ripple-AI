import express from 'express';
import config from './config.js';
import healthRouter from './routes/health.js';
import projectsRouter from './routes/projects.js';
import findingsRouter from './routes/findings.js';
import fixesRouter from './routes/fixes.js';
import reportsRouter from './routes/reports.js';
import aiRouter from './routes/ai.js';
import { notFoundHandler, errorHandler } from './utils/errors.js';

const app = express();

// Request size limit for JSON bodies
app.use(express.json({ limit: config.jsonBodyLimit }));

// CORS allowing only configured frontend origin
app.use((req, res, next) => {
  const allowedOrigin = config.corsOrigin;
  const origin = req.headers.origin;

  if (origin && (allowedOrigin === '*' || origin === allowedOrigin)) {
    res.header('Access-Control-Allow-Origin', origin);
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

// API Routes
app.use('/api', healthRouter);
app.use('/api', projectsRouter);
app.use('/api', findingsRouter);
app.use('/api', fixesRouter);
app.use('/api', reportsRouter);
app.use('/api', aiRouter);

// 404 Handler for undefined routes
app.use(notFoundHandler);

// Central error handler (never leaks stack traces or file paths)
app.use(errorHandler);

export default app;
