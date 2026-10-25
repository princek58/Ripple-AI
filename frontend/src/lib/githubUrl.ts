export interface ParsedGithubUrl {
  owner: string;
  repo: string;
  ref: string;
}

export class GithubUrlError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GithubUrlError';
    this.code = code;
  }
}

export function parseGithubUrl(input: string): ParsedGithubUrl {
  if (typeof input !== 'string') {
    throw new GithubUrlError('GITHUB_URL_INVALID', 'Invalid GitHub URL: must be a string');
  }

  // Length check: max 300 characters
  if (input.length === 0 || input.length > 300) {
    throw new GithubUrlError('GITHUB_URL_INVALID', 'Invalid GitHub URL: must be between 1 and 300 characters');
  }

  // Reject control characters (0x00-0x1F, 0x7F-0x9F) and whitespace
  if (/[\x00-\x20\x7F-\x9F]/.test(input)) {
    throw new GithubUrlError('GITHUB_URL_INVALID', 'Invalid GitHub URL: contains control characters or whitespace');
  }

  // Reject backslashes, encoded slashes, query strings, fragments, and relative path traversal (.. and .)
  if (
    input.includes('\\') ||
    /%2f/i.test(input) ||
    input.includes('?') ||
    input.includes('#') ||
    input.includes('..') ||
    input.includes('/./') ||
    input.endsWith('/.')
  ) {
    throw new GithubUrlError(
      'GITHUB_URL_INVALID',
      'Invalid GitHub URL: contains invalid characters, relative segments, query parameters, or fragment'
    );
  }

  // Must begin with literal https://github.com/
  if (!input.startsWith('https://github.com/')) {
    throw new GithubUrlError('GITHUB_URL_INVALID', 'Invalid GitHub URL: must start with https://github.com/');
  }

  // Validate using URL object for strict origin, port, and credentials verification
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input);
  } catch {
    throw new GithubUrlError('GITHUB_URL_INVALID', 'Invalid GitHub URL: malformed URL');
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'github.com' ||
    parsedUrl.port !== '' ||
    parsedUrl.username !== '' ||
    parsedUrl.password !== '' ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== ''
  ) {
    throw new GithubUrlError(
      'GITHUB_URL_INVALID',
      'Invalid GitHub URL: only standard https://github.com URLs without port or userinfo are allowed'
    );
  }

  // Strip leading and optional trailing slashes from pathname
  let pathPart = parsedUrl.pathname.replace(/^\/+/, '');
  if (pathPart.endsWith('/')) {
    pathPart = pathPart.slice(0, -1);
  }

  if (!pathPart) {
    throw new GithubUrlError('GITHUB_URL_INVALID', 'Invalid GitHub URL: missing repository path');
  }

  const segments = pathPart.split('/');

  let owner = '';
  let rawRepo = '';
  let ref = 'HEAD';

  if (segments.length === 2) {
    owner = segments[0];
    rawRepo = segments[1];
  } else if (segments.length >= 4 && segments[2] === 'tree') {
    owner = segments[0];
    rawRepo = segments[1];
    ref = segments.slice(3).join('/');
  } else {
    throw new GithubUrlError(
      'GITHUB_URL_INVALID',
      'Invalid GitHub URL: extra or unsupported path segments (only /tree/<branch> is supported)'
    );
  }

  // Strip optional .git suffix from repo
  let repo = rawRepo;
  if (repo.endsWith('.git')) {
    repo = repo.slice(0, -4);
  }

  // Validate owner and repo: ^[A-Za-z0-9_.-]{1,100}$ and must not be "." or ".."
  const identPattern = /^[A-Za-z0-9_.-]{1,100}$/;
  if (!identPattern.test(owner) || owner === '.' || owner === '..') {
    throw new GithubUrlError('GITHUB_URL_INVALID', 'Invalid repository owner in GitHub URL');
  }
  if (!identPattern.test(repo) || repo === '.' || repo === '..' || repo.length === 0) {
    throw new GithubUrlError('GITHUB_URL_INVALID', 'Invalid repository name in GitHub URL');
  }

  // Validate ref: ^[A-Za-z0-9._/-]{1,100}$ and must not contain ".."
  if (ref !== 'HEAD') {
    const branchPattern = /^[A-Za-z0-9._/-]{1,100}$/;
    if (
      !branchPattern.test(ref) ||
      ref.includes('..') ||
      ref.includes('//') ||
      ref.startsWith('/') ||
      ref.endsWith('/') ||
      ref.length === 0
    ) {
      throw new GithubUrlError('GITHUB_URL_INVALID', 'Invalid branch or ref in GitHub URL');
    }
  }

  return { owner, repo, ref };
}

export function validateGithubUrl(
  input: string
): { valid: true; parsed: ParsedGithubUrl; error: null } | { valid: false; parsed: null; error: string } {
  try {
    const parsed = parseGithubUrl(input);
    return { valid: true, parsed, error: null };
  } catch {
    return { valid: false, parsed: null, error: 'Invalid GitHub repository link' };
  }
}
