import { loadBackendEnv } from './utils/envLoader.js';

// Real startup path: loads backend/.env if present (no-op in test mode)
loadBackendEnv();

import app from './app.js';
import config from './config.js';

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`Ripple AI Backend listening on port ${PORT}`);
});

