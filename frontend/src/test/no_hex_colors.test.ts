import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function getFilesRecursively(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getFilesRecursively(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

describe('Design System Integrity: No Hardcoded Colors', () => {
  it('ensures no component or source file contains hardcoded hex colors outside tokens.css', () => {
    const srcDir = path.resolve(__dirname, '../');
    const allFiles = getFilesRecursively(srcDir);

    const codeFiles = allFiles.filter((filePath) => {
      const rel = path.relative(srcDir, filePath).replace(/\\/g, '/');
      // Ignore tokens.css (the single source of color tokens)
      if (rel.endsWith('tokens.css')) return false;
      // Ignore this test itself
      if (rel.includes('no_hex_colors.test')) return false;
      // Only check ts and tsx files
      return rel.endsWith('.ts') || rel.endsWith('.tsx');
    });

    const hexColorRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
    const rgbColorRegex = /rgba?\s*\(/gi;

    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of codeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Find any hex colors
        const hexMatches = line.match(hexColorRegex);
        if (hexMatches) {
          for (const match of hexMatches) {
            violations.push({
              file: path.relative(srcDir, file).replace(/\\/g, '/'),
              line: index + 1,
              match,
            });
          }
        }

        // Find any rgb/rgba calls
        const rgbMatches = line.match(rgbColorRegex);
        if (rgbMatches) {
          for (const match of rgbMatches) {
            violations.push({
              file: path.relative(srcDir, file).replace(/\\/g, '/'),
              line: index + 1,
              match,
            });
          }
        }
      });
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}:${v.line} -> "${v.match}"`)
        .join('\n');
      expect.fail(
        `Found ${violations.length} hardcoded color violation(s) outside tokens.css:\n${message}\nColours must only come from tokens.css!`
      );
    }

    expect(violations).toHaveLength(0);
  });
});
