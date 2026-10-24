import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('README claims verification', () => {
  const readmePath = path.resolve(__dirname, '../../README.md');
  const checksDir = path.resolve(__dirname, '../src/checks');

  const readme = fs.readFileSync(readmePath, 'utf-8');

  it('README contains every check id found in the checks folder', () => {
    const checkFiles = fs
      .readdirSync(checksDir)
      .filter((file) => file.endsWith('.ts') && file !== 'index.ts' && file !== 'types.ts');

    const checkIds = checkFiles.map((file) => file.replace(/\.ts$/, ''));

    expect(checkIds.length).toBeGreaterThanOrEqual(6);

    for (const id of checkIds) {
      expect(readme).toContain(id);
    }
  });

  it('README does NOT contain forbidden phrases', () => {
    const forbidden = ['unresolved_import', 'how_to_fix', 'test skeleton', 'skeletons'];
    for (const term of forbidden) {
      expect(readme.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it('README contains the words severity, confidence, and verification', () => {
    expect(readme).toMatch(/\bseverity\b/i);
    expect(readme).toMatch(/\bconfidence\b/i);
    expect(readme).toMatch(/\bverification\b/i);
  });
});
