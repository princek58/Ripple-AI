import fs from 'node:fs';
import path from 'node:path';
import { detectLanguage, isEnvFile } from '../zip/sanitizer.js';
import {
  determineNodeType,
  determineModuleName,
  type ScannedFile,
} from './types.js';

export interface ScanProjectFilesOptions {
  maxSingleFileSizeBytes?: number;
}

/**
 * Safely walks and reads project files from backend/storage/<projectId>/files/.
 * Guarantees strict directory containment.
 * Never loads sensitive contents from .env files.
 */
export function scanProjectFiles(
  projectFilesDir: string,
  options?: ScanProjectFilesOptions
): ScannedFile[] {
  const resolvedBase = path.resolve(projectFilesDir);
  if (!fs.existsSync(resolvedBase)) {
    return [];
  }

  const results: ScannedFile[] = [];
  const maxFileSize = options?.maxSingleFileSizeBytes ?? 5 * 1024 * 1024;

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.resolve(currentDir, entry.name);

      // Path containment safety guard
      if (!fullPath.startsWith(resolvedBase + path.sep)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = path
          .relative(resolvedBase, fullPath)
          .replace(/\\/g, '/');

        const stat = fs.statSync(fullPath);
        const sensitive = isEnvFile(relPath);
        const language = detectLanguage(relPath);
        const type = determineNodeType(relPath);
        const moduleName = determineModuleName(relPath);

        let content: string | undefined = undefined;

        // Only read text content for files under size limit
        if (stat.size <= maxFileSize) {
          if (sensitive) {
            // Never read secret values; extract only variable names matching KEY=
            try {
              const raw = fs.readFileSync(fullPath, 'utf-8');
              const envNames: string[] = [];
              for (const line of raw.split(/\r?\n/)) {
                const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=/);
                if (match) {
                  envNames.push(`${match[1]}=`);
                }
              }
              content = envNames.join('\n');
            } catch {
              content = undefined;
            }
          } else {
            try {
              content = fs.readFileSync(fullPath, 'utf-8');
            } catch {
              content = undefined;
            }
          }
        }

        results.push({
          path: relPath,
          fullPath,
          size: stat.size,
          language,
          sensitive,
          type,
          module: moduleName,
          content,
        });
      }
    }
  }

  walk(resolvedBase);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}
