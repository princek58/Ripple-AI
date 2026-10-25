export type GithubErrorCode =
  | 'GITHUB_URL_INVALID'
  | 'GITHUB_REDIRECT_BLOCKED'
  | 'GITHUB_REPO_TOO_LARGE'
  | 'GITHUB_REPO_NOT_FOUND'
  | 'GITHUB_UNAVAILABLE'
  | 'GITHUB_UNREACHABLE';

export class GithubError extends Error {
  public readonly code: GithubErrorCode;

  constructor(code: GithubErrorCode, message: string) {
    super(message);
    this.name = 'GithubError';
    this.code = code;
    Object.setPrototypeOf(this, GithubError.prototype);
  }
}

export interface ParsedGithubUrl {
  owner: string;
  repo: string;
  ref: string;
}

export interface DownloadGithubZipOptions {
  timeoutMs?: number;
  maxBytes?: number;
  codeloadBase?: string;
}
