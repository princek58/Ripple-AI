import { loadBackendEnv } from './utils/envLoader.js';

// Real startup path: loads backend/.env if present (no-op in test mode)
loadBackendEnv();

import app from './app.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Ripple AI Backend listening on port ${PORT}`);
});

