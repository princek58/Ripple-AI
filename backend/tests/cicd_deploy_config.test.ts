import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

describe('CI/CD and Render Blueprint Configuration', () => {
  const ciWorkflowPath = path.join(rootDir, '.github', 'workflows', 'ci.yml');
  const renderYamlPath = path.join(rootDir, 'render.yaml');

  it('1. CI workflow file exists and triggers on push and pull_request to main', () => {
    expect(fs.existsSync(ciWorkflowPath)).toBe(true);
    const content = fs.readFileSync(ciWorkflowPath, 'utf-8');

    // Trigger on push to main
    expect(content).toMatch(/push:\s+branches:\s+-\s+main/);
    // Trigger on pull_request to main
    expect(content).toMatch(/pull_request:\s+branches:\s+-\s+main/);
  });

  it('2. CI workflow configures ubuntu environment, Node 20, dependency install, typecheck, tests, and builds', () => {
    const content = fs.readFileSync(ciWorkflowPath, 'utf-8');

    // OS, runner and timeout
    expect(content).toContain('runs-on: ubuntu-latest');
    expect(content).toContain('timeout-minutes: 15');

    // Checkout and Node 20 setup
    expect(content).toContain('actions/checkout@v4');
    expect(content).toContain('actions/setup-node@v4');
    expect(content).toMatch(/node-version:\s*20/);

    // Monorepo clean dependency install
    expect(content).toMatch(/npm ci/);

    // Backend typecheck, test, and build
    expect(content).toContain('npx tsc -p tsconfig.test.json --noEmit');
    expect(content).toMatch(/npm test/);
    expect(content).toMatch(/npm run build/);

    // Frontend typecheck and test
    expect(content).toContain('npx tsc -b');

    // Full production single-service build
    expect(content).toContain('npm run build:all');
  });

  it('3. CI workflow verifies production build artifacts and contains zero hardcoded secrets or keys', () => {
    const content = fs.readFileSync(ciWorkflowPath, 'utf-8');

    // Verifies production dist artifacts exist
    expect(content).toContain('frontend/dist/index.html');
    expect(content).toContain('backend/dist/server.js');

    // Contains zero secret keys or tokens hardcoded
    const forbiddenPatterns = [
      /AIza[0-9A-Za-z-_]{35}/,
      /gsk_[0-9A-Za-z]{20,}/,
      /GEMINI_API_KEY\s*[:=]\s*['"]?[a-zA-Z0-9_-]{10,}/,
      /GROQ_API_KEY\s*[:=]\s*['"]?[a-zA-Z0-9_-]{10,}/,
      /APP_ACCESS_CODE\s*[:=]\s*['"]?[a-zA-Z0-9_-]{4,}/,
      /APP_SESSION_SECRET\s*[:=]\s*['"]?[a-zA-Z0-9_-]{10,}/,
    ];

    for (const pattern of forbiddenPatterns) {
      expect(content).not.toMatch(pattern);
    }
  });

  it('4. render.yaml exists and defines a single node web service with build, start, and health check commands', () => {
    expect(fs.existsSync(renderYamlPath)).toBe(true);
    const content = fs.readFileSync(renderYamlPath, 'utf-8');

    // Service definition
    expect(content).toMatch(/type:\s*web/);
    expect(content).toMatch(/name:\s*ripple-ai/);
    expect(content).toMatch(/(runtime|env):\s*node/);
    expect(content).toMatch(/plan:\s*free/);

    // Build command must install dependencies and build both workspaces
    expect(content).toMatch(/buildCommand:.*npm run build:all/);
    expect(content).toMatch(/buildCommand:.*(install:all|npm ci|npm install)/);

    // Start command
    expect(content).toMatch(/startCommand:\s*npm run start:prod/);

    // Public health check route
    expect(content).toMatch(/healthCheckPath:\s*\/api\/health/);
  });

  it('5. render.yaml configures production environment variables and marks sensitive secrets as sync: false', () => {
    const content = fs.readFileSync(renderYamlPath, 'utf-8');

    // NODE_ENV
    expect(content).toMatch(/key:\s*NODE_ENV\s+value:\s*production/);

    // PUBLIC_DEMO_MODE
    expect(content).toMatch(/key:\s*PUBLIC_DEMO_MODE\s+value:\s*["']?true["']?/);

    // APP_SESSION_SECRET with generateValue
    expect(content).toMatch(/key:\s*APP_SESSION_SECRET\s+generateValue:\s*true/);

    // APP_ACCESS_CODE marked sync: false
    expect(content).toMatch(/key:\s*APP_ACCESS_CODE\s+sync:\s*false/);

    // GEMINI_API_KEY marked sync: false
    expect(content).toMatch(/key:\s*GEMINI_API_KEY\s+sync:\s*false/);

    // GEMINI_MODEL set to gemini-1.5-flash
    expect(content).toMatch(/key:\s*GEMINI_MODEL\s+value:\s*gemini-[12]\.5-flash/);

    // GROQ_API_KEY marked sync: false
    expect(content).toMatch(/key:\s*GROQ_API_KEY\s+sync:\s*false/);

    // GROQ_MODEL set to llama-3.3-70b-versatile
    expect(content).toMatch(/key:\s*GROQ_MODEL\s+value:\s*llama-3\.3-70b-versatile/);
  });
});
