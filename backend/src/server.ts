import fs from 'node:fs';
import path from 'node:path';
import { loadBackendEnv } from './utils/envLoader.js';

// Real startup path: loads backend/.env if present (no-op in test mode)
loadBackendEnv();

import app from './app.js';
import config from './config.js';

// Explicitly ensure runtime storage, temp, and data directories exist
fs.mkdirSync(config.storagePath, { recursive: true });
fs.mkdirSync(config.tempStoragePath, { recursive: true });
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`Ripple AI Backend listening on port ${PORT}`);
});

