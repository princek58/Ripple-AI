import type { NodeType } from '../../types.js';

export interface ScannedFile {
  path: string; // Relative path, forward slashes
  fullPath: string; // Absolute path on disk
  size: number;
  language: string;
  sensitive: boolean;
  type: NodeType;
  module: string;
  content?: string; // Text content if read, undefined for sensitive/unreadable
}

export function determineNodeType(filePath: string): NodeType {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();

  // 1. Test files
  if (
    /\.(test|spec)\.[a-z0-9]+$/i.test(normalized) ||
    normalized.includes('__tests__') ||
    normalized.includes('/tests/')
  ) {
    return 'test';
  }

  // 2. Database models / schemas
  if (
    /\/models\//i.test(normalized) ||
    /(\/|^)(model|schema|database|db)\.[a-z0-9]+$/i.test(normalized)
  ) {
    return 'database';
  }

  // 3. Config files (.env*, package.json, config files)
  if (
    normalized.endsWith('.json') ||
    normalized.endsWith('.yaml') ||
    normalized.endsWith('.yml') ||
    normalized.endsWith('.env') ||
    normalized.includes('.env.') ||
    /\/config\//i.test(normalized)
  ) {
    return 'config';
  }

  // 4. Frontend files (jsx, tsx or under frontend/pages/components)
  if (
    normalized.endsWith('.tsx') ||
    normalized.endsWith('.jsx') ||
    /\/frontend\//i.test(normalized) ||
    /\/pages\//i.test(normalized) ||
    /\/components\//i.test(normalized)
  ) {
    return 'frontend';
  }

  // 5. Backend
  return 'backend';
}

export function determineModuleName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();

  // Primary feature candidates
  const features = ['notices', 'marks', 'fees', 'login'];

  for (const feature of features) {
    const singular = feature.endsWith('s') ? feature.slice(0, -1) : feature;
    // Check if path contains feature word or prefix (e.g. notices, noticeService, NoticePage)
    const regex = new RegExp(`(^|[/._-])${singular}[a-z0-9_-]*`, 'i');
    if (regex.test(lower)) {
      return feature;
    }
  }

  return 'shared';
}
