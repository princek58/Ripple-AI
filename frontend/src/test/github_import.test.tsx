import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UploadFlow } from '../features/projects/UploadFlow.js';
import { ProjectProvider } from '../lib/projectContext.js';
import { api, ApiClientError } from '../lib/api.js';
import capturedImportSuccess from './fixtures/api/github_import_success.json';
import captured400 from './fixtures/api/github_error_400.json';
import captured404 from './fixtures/api/github_error_404.json';
import captured413 from './fixtures/api/github_error_413.json';
import captured502 from './fixtures/api/github_error_502.json';
import type { Scan } from '../../../shared/types.js';

const mockScan: Scan = {
  id: 'scan-uuid-1234',
  project_id: capturedImportSuccess.data.id,
  started_at: '2026-10-25T21:15:35.551Z',
  finished_at: '2026-10-25T21:15:36.551Z',
  status: 'completed',
  files_total: 2,
  files_skipped: 0,
  notes: 'Imported from github.com/octocat/Hello-World (public)',
};

describe('UploadFlow — GitHub Import Flow (Step G1 Part 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getProjects').mockResolvedValue([]);
  });

  it('renders tablist with Upload ZIP and From GitHub URL tabs and allows switching', async () => {
    render(
      <MemoryRouter>
        <ProjectProvider>
          <UploadFlow isOpen={true} onClose={vi.fn()} />
        </ProjectProvider>
      </MemoryRouter>
    );

    const zipTab = screen.getByTestId('tab-zip');
    const githubTab = screen.getByTestId('tab-github');

    expect(zipTab).toBeInTheDocument();
    expect(githubTab).toBeInTheDocument();

    // Default tab is ZIP
    expect(zipTab).toHaveAttribute('aria-selected', 'true');
    expect(githubTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('file-upload-input')).toBeInTheDocument();

    // Switch to GitHub tab
    fireEvent.click(githubTab);
    expect(githubTab).toHaveAttribute('aria-selected', 'true');
    expect(zipTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('github-url-input')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Only public repositories. Ripple downloads a ZIP copy to this computer. Code is never executed.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tip: if you have no internet, download the ZIP from GitHub and use the Upload ZIP tab.')
    ).toBeInTheDocument();

    // Switch back to ZIP tab
    fireEvent.click(zipTab);
    expect(zipTab).toHaveAttribute('aria-selected', 'true');
    expect(githubTab).toHaveAttribute('aria-selected', 'false');
  });

  it('supports keyboard navigation across tabs (ArrowRight, ArrowLeft, Home, End)', async () => {
    render(
      <MemoryRouter>
        <ProjectProvider>
          <UploadFlow isOpen={true} onClose={vi.fn()} />
        </ProjectProvider>
      </MemoryRouter>
    );

    const zipTab = screen.getByTestId('tab-zip');
    const githubTab = screen.getByTestId('tab-github');

    // ArrowRight from zipTab to githubTab
    fireEvent.keyDown(zipTab, { key: 'ArrowRight' });
    expect(githubTab).toHaveAttribute('aria-selected', 'true');

    // ArrowLeft from githubTab to zipTab
    fireEvent.keyDown(githubTab, { key: 'ArrowLeft' });
    expect(zipTab).toHaveAttribute('aria-selected', 'true');

    // End jumps to githubTab
    fireEvent.keyDown(zipTab, { key: 'End' });
    expect(githubTab).toHaveAttribute('aria-selected', 'true');

    // Home jumps to zipTab
    fireEvent.keyDown(githubTab, { key: 'Home' });
    expect(zipTab).toHaveAttribute('aria-selected', 'true');
  });

  it('rejects invalid GitHub URL client-side and makes zero network calls', async () => {
    const importSpy = vi.spyOn(api, 'importGithubProject');

    render(
      <MemoryRouter>
        <ProjectProvider>
          <UploadFlow isOpen={true} onClose={vi.fn()} />
        </ProjectProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('tab-github'));

    const input = screen.getByTestId('github-url-input');
    const importBtn = screen.getByRole('button', { name: 'Import and scan' });

    // Try lookalike host
    fireEvent.change(input, { target: { value: 'https://github.com.evil.com/owner/repo' } });
    fireEvent.click(importBtn);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Invalid GitHub repository link')).toBeInTheDocument();
    expect(importSpy).not.toHaveBeenCalled();

    // Try path traversal
    fireEvent.change(input, { target: { value: 'https://github.com/owner/../repo' } });
    fireEvent.click(importBtn);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(importSpy).not.toHaveBeenCalled();
  });

  it('successful GitHub import calls importGithubProject then scanProject and refreshes list', async () => {
    const importSpy = vi
      .spyOn(api, 'importGithubProject')
      .mockResolvedValue(capturedImportSuccess.data as any);
    const scanSpy = vi.spyOn(api, 'scanProject').mockResolvedValue(mockScan);
    const refreshSpy = vi.spyOn(api, 'getProjects').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ProjectProvider>
          <UploadFlow isOpen={true} onClose={vi.fn()} />
        </ProjectProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('tab-github'));

    const input = screen.getByTestId('github-url-input');
    fireEvent.change(input, { target: { value: 'https://github.com/octocat/Hello-World' } });

    const importBtn = screen.getByRole('button', { name: 'Import and scan' });
    fireEvent.click(importBtn);

    // Honest progress states
    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledWith(
        'https://github.com/octocat/Hello-World',
        expect.any(AbortSignal)
      );
    });

    await waitFor(() => {
      expect(scanSpy).toHaveBeenCalledWith(capturedImportSuccess.data.id, expect.any(AbortSignal));
    });

    // Success screen
    await waitFor(() => {
      expect(screen.getByText('Scan completed successfully')).toBeInTheDocument();
      expect(
        screen.getByText('Imported from github.com/octocat/Hello-World (public)')
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Open overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('displays friendly message for every error code without raw server stack traces', async () => {
    const testCases: Array<{
      status: number;
      code: string;
      fixtureMessage: string;
      expectedFriendly: string;
    }> = [
      {
        status: 400,
        code: 'GITHUB_URL_INVALID',
        fixtureMessage: captured400.error,
        expectedFriendly: 'Invalid GitHub repository link',
      },
      {
        status: 404,
        code: 'GITHUB_REPO_NOT_FOUND',
        fixtureMessage: captured404.error,
        expectedFriendly:
          'Repository does not exist or is private (only public repositories are supported)',
      },
      {
        status: 413,
        code: 'GITHUB_REPO_TOO_LARGE',
        fixtureMessage: captured413.error,
        expectedFriendly: 'Repository is too large (maximum 50 MB)',
      },
      {
        status: 502,
        code: 'GITHUB_REDIRECT_BLOCKED',
        fixtureMessage: captured502.error,
        expectedFriendly: 'GitHub download was redirected to an untrusted address',
      },
      {
        status: 502,
        code: 'GITHUB_UNAVAILABLE',
        fixtureMessage: 'Service unavailable [GITHUB_UNAVAILABLE]',
        expectedFriendly: 'GitHub is busy or rate limited, please try again shortly',
      },
      {
        status: 502,
        code: 'GITHUB_UNREACHABLE',
        fixtureMessage: 'Network error [GITHUB_UNREACHABLE]',
        expectedFriendly: 'Unable to reach GitHub. Please check your internet connection.',
      },
      {
        status: 429,
        code: 'CONCURRENCY_LIMIT',
        fixtureMessage: 'Too many uploads in progress. Please try again shortly. [CONCURRENCY_LIMIT]',
        expectedFriendly: 'Too many uploads at once, try again shortly',
      },
      {
        status: 422,
        code: 'ZIP_BOMB',
        fixtureMessage: 'Suspicious zip bomb [ZIP_BOMB]',
        expectedFriendly: 'Archive compression ratio is suspiciously high [ZIP_BOMB]',
      },
    ];

    for (const tc of testCases) {
      vi.spyOn(api, 'importGithubProject').mockRejectedValueOnce(
        new ApiClientError(tc.fixtureMessage, tc.status, tc.code)
      );

      const { unmount } = render(
        <MemoryRouter>
          <ProjectProvider>
            <UploadFlow isOpen={true} onClose={vi.fn()} />
          </ProjectProvider>
        </MemoryRouter>
      );

      fireEvent.click(screen.getByTestId('tab-github'));
      fireEvent.change(screen.getByTestId('github-url-input'), {
        target: { value: 'https://github.com/octocat/Hello-World' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Import and scan' }));

      await waitFor(() => {
        expect(screen.getByText('Import failed')).toBeInTheDocument();
        expect(screen.getByText(tc.expectedFriendly)).toBeInTheDocument();
      });

      // Assert raw server trace or uncaught error is not shown
      expect(screen.queryByText(/Error: /)).not.toBeInTheDocument();
      expect(screen.queryByText(/at Object/)).not.toBeInTheDocument();

      unmount();
    }
  });

  it('Cancel aborts the active in-flight GitHub import request', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(api, 'importGithubProject').mockImplementation((_, signal) => {
      capturedSignal = signal;
      return new Promise(() => {}); // Pending indefinitely
    });

    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ProjectProvider>
          <UploadFlow isOpen={true} onClose={onClose} />
        </ProjectProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('tab-github'));
    fireEvent.change(screen.getByTestId('github-url-input'), {
      target: { value: 'https://github.com/octocat/Hello-World' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import and scan' }));

    await waitFor(() => {
      expect(screen.getByText('Downloading from GitHub...')).toBeInTheDocument();
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(capturedSignal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it('prevents double submit when clicking Import and scan rapidly', async () => {
    let resolveImport: (val: any) => void;
    const importPromise = new Promise((resolve) => {
      resolveImport = resolve;
    });

    const importSpy = vi.spyOn(api, 'importGithubProject').mockReturnValue(importPromise as any);
    vi.spyOn(api, 'scanProject').mockResolvedValue(mockScan);

    render(
      <MemoryRouter>
        <ProjectProvider>
          <UploadFlow isOpen={true} onClose={vi.fn()} />
        </ProjectProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('tab-github'));
    fireEvent.change(screen.getByTestId('github-url-input'), {
      target: { value: 'https://github.com/octocat/Hello-World' },
    });

    const importBtn = screen.getByRole('button', { name: 'Import and scan' });
    fireEvent.click(importBtn);
    fireEvent.click(importBtn);
    fireEvent.click(importBtn);

    expect(importSpy).toHaveBeenCalledTimes(1);

    resolveImport!(capturedImportSuccess.data);
  });

  it('Retry in error state triggers another attempt', async () => {
    const importSpy = vi
      .spyOn(api, 'importGithubProject')
      .mockRejectedValueOnce(new ApiClientError('Network error', 502, 'GITHUB_UNREACHABLE'))
      .mockResolvedValueOnce(capturedImportSuccess.data as any);
    vi.spyOn(api, 'scanProject').mockResolvedValue(mockScan);

    render(
      <MemoryRouter>
        <ProjectProvider>
          <UploadFlow isOpen={true} onClose={vi.fn()} />
        </ProjectProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('tab-github'));
    fireEvent.change(screen.getByTestId('github-url-input'), {
      target: { value: 'https://github.com/octocat/Hello-World' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import and scan' }));

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeInTheDocument();
    });

    // Click Retry
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Scan completed successfully')).toBeInTheDocument();
    });
  });

  it('ZIP upload tab still functions normally and is not impacted by GitHub tab', async () => {
    const uploadSpy = vi.spyOn(api, 'uploadProject').mockResolvedValue(capturedImportSuccess.data as any);
    vi.spyOn(api, 'scanProject').mockResolvedValue(mockScan);

    render(
      <MemoryRouter>
        <ProjectProvider>
          <UploadFlow isOpen={true} onClose={vi.fn()} />
        </ProjectProvider>
      </MemoryRouter>
    );

    // Switch to GitHub and back to ZIP
    fireEvent.click(screen.getByTestId('tab-github'));
    fireEvent.click(screen.getByTestId('tab-zip'));

    const fileInput = screen.getByTestId('file-upload-input');
    const validFile = new File(['fake zip'], 'repo.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    expect(screen.getByText('repo.zip')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import and scan' }));

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith(validFile, expect.any(AbortSignal));
      expect(screen.getByText('Scan completed successfully')).toBeInTheDocument();
    });
  });
});
