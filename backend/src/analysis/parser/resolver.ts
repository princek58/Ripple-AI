import path from 'node:path';

export interface ResolveImportResult {
  isResolved?: boolean;
  targetPath?: string; // Relative path of the resolved file in the project
  isExternal?: boolean; // Bare package import (e.g. 'express', 'react')
  packageName?: string;
  isUnresolved?: boolean; // Relative import pointing to missing or outside file
  reason?: string;
}

const EXTENSIONS_TO_TRY = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
  '/index.json',
];

/**
 * Resolves an import specifier strictly against the project's own file list.
 * Bare imports are identified as external packages.
 * Relative imports that escape the project root or fail to match any file are marked unresolved.
 */
export function resolveImport(
  fromFilePath: string,
  specifier: string,
  projectFilesSet: Set<string>
): ResolveImportResult {
  // 1. Bare import (external package)
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return {
      isExternal: true,
      packageName: specifier,
    };
  }

  // 2. Compute normalized relative path
  const fromDir = path.posix.dirname(fromFilePath.replace(/\\/g, '/'));
  const targetCandidate = path.posix.normalize(path.posix.join(fromDir, specifier));

  // 3. Containment check: reject paths escaping project root (e.g. "../../outside")
  if (targetCandidate.startsWith('../') || targetCandidate === '..') {
    return {
      isUnresolved: true,
      reason: 'PATH_ESCAPES_ROOT',
    };
  }

  // 4. Try candidate extensions against project files
  for (const ext of EXTENSIONS_TO_TRY) {
    const candidateWithExt = targetCandidate + ext;
    if (projectFilesSet.has(candidateWithExt)) {
      return {
        isResolved: true,
        targetPath: candidateWithExt,
      };
    }
  }

  // 5. File not found in project
  return {
    isUnresolved: true,
    reason: 'FILE_NOT_FOUND',
  };
}
