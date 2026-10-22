import path from 'node:path';

export function isEnvFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return base === '.env' || base.startsWith('.env.');
}

export function sanitizeEnvContent(content: string): string {
  const lines = content.split(/\r?\n/);
  const sanitizedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Drop all comments (can contain secrets) and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Match KEY=value or export KEY=value
    const match = trimmed.match(/^(?:export\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (match) {
      sanitizedLines.push(`${match[1]}=`);
      continue;
    }

    // Match bare keys like KEY or export KEY
    const bareMatch = trimmed.match(/^(?:export\s+)?([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (bareMatch) {
      sanitizedLines.push(`${bareMatch[1]}=`);
    }
  }

  return sanitizedLines.length > 0 ? sanitizedLines.join('\n') + '\n' : '';
}

export function detectLanguage(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();

  if (base === '.env' || base.startsWith('.env.')) {
    return 'Environment';
  }
  if (base === 'package.json' || base.endsWith('.json')) {
    return 'JSON';
  }
  if (base === 'dockerfile') {
    return 'Dockerfile';
  }
  if (base.endsWith('.yaml') || base.endsWith('.yml')) {
    return 'YAML';
  }

  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.mts':
    case '.cts':
      return 'TypeScript';
    case '.tsx':
      return 'TypeScript (TSX)';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'JavaScript';
    case '.jsx':
      return 'JavaScript (JSX)';
    case '.json':
      return 'JSON';
    case '.css':
    case '.scss':
    case '.sass':
    case '.less':
      return 'CSS';
    case '.html':
    case '.htm':
      return 'HTML';
    case '.md':
    case '.markdown':
      return 'Markdown';
    case '.py':
      return 'Python';
    case '.sql':
      return 'SQL';
    case '.sh':
    case '.bash':
      return 'Shell';
    case '.xml':
    case '.svg':
      return 'XML';
    default:
      return ext ? ext.slice(1).toUpperCase() : 'Unknown';
  }
}
