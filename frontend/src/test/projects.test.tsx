import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProjectProvider, STORAGE_KEY } from '../lib/projectContext.js';
import { ProjectsPage } from '../features/projects/ProjectsPage.js';
import { ProjectCard } from '../features/projects/ProjectCard.js';
import { UploadFlow, MAX_UPLOAD_SIZE_BYTES } from '../features/projects/UploadFlow.js';
import { api, getFriendlyErrorMessage, ApiClientError } from '../lib/api.js';
import type { Project, Scan, ProjectSummary } from '../../../shared/types.js';

// Real captured fixtures
import projectsListFixture from './fixtures/api/projects_list.json';
import projectUploadFixture from './fixtures/api/project_upload.json';
import projectScanFixture from './fixtures/api/project_scan.json';
import projectSummaryFixture from './fixtures/api/project_summary.json';
import error400Fixture from './fixtures/api/error_400_invalid_zip.json';
import error404Fixture from './fixtures/api/error_404_not_found.json';

const capturedProjects: Project[] = projectsListFixture.data;
const capturedUploadProject: Project = projectUploadFixture.data;
const capturedScan: Scan = projectScanFixture.data;
const capturedSummary: ProjectSummary = projectSummaryFixture.data as unknown as ProjectSummary;

describe('Projects Feature & Selected-Project State (Step 10a)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('ProjectCard & Real Fixture Rendering', () => {
    it('shows every field from the captured fixture', () => {
      const p = capturedProjects[0];
      const onOpen = vi.fn();
      const onRescan = vi.fn();
      const onDelete = vi.fn();

      render(
        <ProjectCard
          project={p}
          summaryState={{ data: capturedSummary, loading: false, error: false }}
          onOpen={onOpen}
          onRescan={onRescan}
          onDelete={onDelete}
        />
      );

      // Name
      expect(screen.getByText('demo-erp')).toBeInTheDocument();
      // Formatted date (Oct 23, 2026) appears in created date and last scan
      const dates = screen.getAllByText(/Oct 23, 2026/);
      expect(dates.length).toBeGreaterThanOrEqual(1);
      // Human-readable size (4.4 KB for 4506 bytes)
      expect(screen.getByText(/4\.4 KB/)).toBeInTheDocument();
      // Last scan time
      expect(screen.getByText(/Last scan:/)).toBeInTheDocument();
    });

    it('shows "Not scanned yet" when last_scan_at is null', () => {
      const p: Project = {
        ...capturedProjects[0],
        id: 'no-scan-proj',
        last_scan_at: null,
      };

      render(
        <ProjectCard
          project={p}
          onOpen={vi.fn()}
          onRescan={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByText('Last scan: Not scanned yet')).toBeInTheDocument();
    });

    it('renders languages as chips from an array', () => {
      const p = capturedProjects[0];

      render(
        <ProjectCard
          project={p}
          onOpen={vi.fn()}
          onRescan={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      const chips = screen.getAllByTestId('language-chip');
      expect(chips).toHaveLength(3);
      expect(chips[0]).toHaveTextContent('Environment');
      expect(chips[1]).toHaveTextContent('JavaScript');
      expect(chips[2]).toHaveTextContent('TypeScript (TSX)');
    });

    it('shows severity badges with counts from the summary fixture', () => {
      const p = capturedProjects[0];

      render(
        <ProjectCard
          project={p}
          summaryState={{ data: capturedSummary, loading: false, error: false }}
          onOpen={vi.fn()}
          onRescan={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      // bySeverity in fixture: critical: 0, high: 1, medium: 2, low: 6
      const badgesContainer = screen.getByTestId('summary-badges');
      expect(badgesContainer).toBeInTheDocument();

      const criticalBadge = screen.getByTestId('severity-badge-critical');
      const highBadge = screen.getByTestId('severity-badge-high');
      const mediumBadge = screen.getByTestId('severity-badge-medium');
      const lowBadge = screen.getByTestId('severity-badge-low');

      expect(criticalBadge).toHaveTextContent('0');
      expect(highBadge).toHaveTextContent('1');
      expect(mediumBadge).toHaveTextContent('2');
      expect(lowBadge).toHaveTextContent('6');
    });

    it('shows "Summary unavailable" and NEVER zeros when a summary fails', () => {
      const p = capturedProjects[0];

      render(
        <ProjectCard
          project={p}
          summaryState={{ loading: false, error: true }}
          onOpen={vi.fn()}
          onRescan={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByTestId('summary-unavailable')).toBeInTheDocument();
      expect(screen.getByText('Summary unavailable')).toBeInTheDocument();

      // Zero severity badges must NOT exist
      expect(screen.queryByTestId('summary-badges')).not.toBeInTheDocument();
      expect(screen.queryByTestId('severity-badge-critical')).not.toBeInTheDocument();
    });

    it('shows skeleton while summary is loading', () => {
      const p = capturedProjects[0];

      render(
        <ProjectCard
          project={p}
          summaryState={{ loading: true, error: false }}
          onOpen={vi.fn()}
          onRescan={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByTestId('summary-skeleton')).toBeInTheDocument();
    });

    it('disables Re-scan button and shows "Scanning..." while scan is running', async () => {
      const p = capturedProjects[0];
      let resolveRescan: () => void = () => {};
      const rescanPromise = new Promise<void>((resolve) => {
        resolveRescan = resolve;
      });
      const onRescan = vi.fn().mockReturnValue(rescanPromise);

      render(
        <ProjectCard
          project={p}
          onOpen={vi.fn()}
          onRescan={onRescan}
          onDelete={vi.fn()}
        />
      );

      const rescanBtn = screen.getByTestId(`rescan-button-${p.id}`);
      expect(rescanBtn).toHaveTextContent('Re-scan');
      expect(rescanBtn).not.toBeDisabled();

      fireEvent.click(rescanBtn);

      expect(onRescan).toHaveBeenCalledWith(p);
      expect(rescanBtn).toHaveTextContent('Scanning...');
      expect(rescanBtn).toBeDisabled();

      resolveRescan();
      await waitFor(() => {
        expect(rescanBtn).toHaveTextContent('Re-scan');
        expect(rescanBtn).not.toBeDisabled();
      });
    });

    it('handles Delete flow: calls DELETE only after confirm button; Escape and Cancel do not call it; focus returns to trigger', async () => {
      const p = capturedProjects[0];
      const onDelete = vi.fn().mockResolvedValue(undefined);

      render(
        <ProjectCard
          project={p}
          onOpen={vi.fn()}
          onRescan={vi.fn()}
          onDelete={onDelete}
        />
      );

      const menuBtn = screen.getByTestId(`project-menu-button-${p.id}`);
      menuBtn.focus();
      expect(document.activeElement).toBe(menuBtn);

      // Open menu
      fireEvent.click(menuBtn);
      const deleteTrigger = screen.getByTestId(`project-delete-trigger-${p.id}`);

      // 1. Open confirm dialog
      fireEvent.click(deleteTrigger);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(
        screen.getByText(/The project's stored files and findings will be removed permanently/)
      ).toBeInTheDocument();

      // Cancel button test
      const cancelBtn = screen.getByTestId('cancel-delete-button');
      fireEvent.click(cancelBtn);
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(menuBtn);

      // 2. Escape closes without calling DELETE
      fireEvent.click(menuBtn);
      fireEvent.click(screen.getByTestId(`project-delete-trigger-${p.id}`));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(menuBtn);

      // 3. Confirm calls onDelete
      fireEvent.click(menuBtn);
      fireEvent.click(screen.getByTestId(`project-delete-trigger-${p.id}`));
      const confirmBtn = screen.getByTestId('confirm-delete-button');
      fireEvent.click(confirmBtn);

      expect(onDelete).toHaveBeenCalledWith(p);
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('ProjectsPage States & Search Filtering', () => {
    it('shows loading skeletons initially', async () => {
      vi.spyOn(api, 'getProjects').mockReturnValue(new Promise(() => {})); // Never resolves

      render(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectsPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('projects-loading-skeletons')).toBeInTheDocument();
    });

    it('shows empty state "Upload your first project" with upload button when no projects exist', async () => {
      vi.spyOn(api, 'getProjects').mockResolvedValue([]);

      render(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectsPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Upload your first project')).toBeInTheDocument();
      });

      expect(screen.getByTestId('upload-first-project-button')).toBeInTheDocument();
    });

    it('shows error state with Retry when projects request fails', async () => {
      vi.spyOn(api, 'getProjects').mockRejectedValue(new Error('Network error'));

      render(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectsPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('Backend is not reachable')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('filters projects by name with client-side search', async () => {
      vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
      vi.spyOn(api, 'getSummary').mockResolvedValue(capturedSummary);

      render(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectsPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('projects-grid')).toBeInTheDocument();
      });

      expect(screen.getByText('demo-erp')).toBeInTheDocument();
      expect(screen.getByText('demo-erp-test')).toBeInTheDocument();

      const searchInput = screen.getByTestId('project-search-input');
      fireEvent.change(searchInput, { target: { value: 'demo-erp-test' } });

      expect(screen.queryByText('demo-erp')).not.toBeInTheDocument();
      expect(screen.getByText('demo-erp-test')).toBeInTheDocument();

      fireEvent.change(searchInput, { target: { value: 'nonexistent-query' } });
      expect(screen.getByText(/No projects match "nonexistent-query"/)).toBeInTheDocument();
    });

    it('Open button selects the project and navigates to /app/overview', async () => {
      vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
      vi.spyOn(api, 'getSummary').mockResolvedValue(capturedSummary);

      render(
        <MemoryRouter initialEntries={['/app/projects']}>
          <ProjectProvider>
            <Routes>
              <Route path="/app/projects" element={<ProjectsPage />} />
              <Route path="/app/overview" element={<div data-testid="overview-view">Overview Page</div>} />
            </Routes>
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`open-project-button-${capturedProjects[0].id}`)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId(`open-project-button-${capturedProjects[0].id}`));

      await waitFor(() => {
        expect(screen.getByTestId('overview-view')).toBeInTheDocument();
      });
    });
  });

  describe('UploadFlow Client Validation & Dual API Call', () => {
    it('rejects a non-.zip file with no network call', async () => {
      vi.spyOn(api, 'getProjects').mockResolvedValue([]);
      const fetchSpy = vi.spyOn(api, 'uploadProject');

      render(
        <MemoryRouter>
          <ProjectProvider>
            <UploadFlow isOpen={true} onClose={vi.fn()} />
          </ProjectProvider>
        </MemoryRouter>
      );

      const fileInput = await screen.findByTestId('file-upload-input');
      const badFile = new File(['hello'], 'code.tar.gz', { type: 'application/gzip' });

      fireEvent.change(fileInput, { target: { files: [badFile] } });

      expect(screen.getByText('This is not a valid ZIP file')).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects a file above 50 MB with no network call', async () => {
      vi.spyOn(api, 'getProjects').mockResolvedValue([]);
      const fetchSpy = vi.spyOn(api, 'uploadProject');

      render(
        <MemoryRouter>
          <ProjectProvider>
            <UploadFlow isOpen={true} onClose={vi.fn()} />
          </ProjectProvider>
        </MemoryRouter>
      );

      const fileInput = await screen.findByTestId('file-upload-input');
      // Create fake file larger than 50 MB
      const hugeFile = new File(['x'], 'giant.zip', { type: 'application/zip' });
      Object.defineProperty(hugeFile, 'size', { value: MAX_UPLOAD_SIZE_BYTES + 1024 });

      fireEvent.change(fileInput, { target: { files: [hugeFile] } });

      expect(screen.getByText('File is too large')).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('shows review step with safety text and size, then runs POST /api/projects then POST /scan on "Import and scan"', async () => {
      const uploadSpy = vi.spyOn(api, 'uploadProject').mockResolvedValue(capturedUploadProject);
      const scanSpy = vi.spyOn(api, 'scanProject').mockResolvedValue(capturedScan);
      const refreshSpy = vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);

      render(
        <MemoryRouter>
          <ProjectProvider>
            <UploadFlow isOpen={true} onClose={vi.fn()} />
          </ProjectProvider>
        </MemoryRouter>
      );

      const fileInput = screen.getByTestId('file-upload-input');
      const validFile = new File(['valid zip content'], 'demo-erp.zip', { type: 'application/zip' });
      Object.defineProperty(validFile, 'size', { value: 4506 });

      fireEvent.change(fileInput, { target: { files: [validFile] } });

      // Review step
      expect(screen.getByText('demo-erp.zip')).toBeInTheDocument();
      expect(screen.getByText(/4\.4 KB/)).toBeInTheDocument();
      expect(
        screen.getByText('Code is not executed. Secret values are never read or shown.')
      ).toBeInTheDocument();

      const importBtn = screen.getByRole('button', { name: 'Import and scan' });
      fireEvent.click(importBtn);

      // Verify call sequence
      await waitFor(() => {
        expect(uploadSpy).toHaveBeenCalledWith(validFile, expect.any(AbortSignal));
      });
      await waitFor(() => {
        expect(scanSpy).toHaveBeenCalledWith(capturedUploadProject.id, expect.any(AbortSignal));
      });

      // Verify success state shows backend scan notes
      await waitFor(() => {
        expect(screen.getByText('Scan completed successfully')).toBeInTheDocument();
        expect(screen.getByText(capturedScan.notes!)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Open overview' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(refreshSpy).toHaveBeenCalled();
    });

    it('Cancel aborts active upload request', async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.spyOn(api, 'uploadProject').mockImplementation((_, signal) => {
        capturedSignal = signal;
        return new Promise(() => {}); // Pending indefinitely
      });

      render(
        <MemoryRouter>
          <ProjectProvider>
            <UploadFlow isOpen={true} onClose={vi.fn()} />
          </ProjectProvider>
        </MemoryRouter>
      );

      const fileInput = screen.getByTestId('file-upload-input');
      const validFile = new File(['zip'], 'demo.zip', { type: 'application/zip' });
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      fireEvent.click(screen.getByRole('button', { name: 'Import and scan' }));

      await waitFor(() => {
        expect(screen.getByText('Uploading...')).toBeInTheDocument();
      });

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);

      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe('Error Mapping & Friendly Explanations', () => {
    it('maps 400 to "This is not a valid ZIP file"', () => {
      const err = new ApiClientError(error400Fixture.error, 400, 'ZIP_INVALID');
      expect(getFriendlyErrorMessage(err)).toBe('This is not a valid ZIP file');
    });

    it('maps 413 to "File is too large"', () => {
      const err = new ApiClientError('File size exceeds limit', 413, 'FILE_TOO_LARGE');
      expect(getFriendlyErrorMessage(err)).toBe('File is too large');
    });

    it('maps 422 reason codes to friendly plain explanations and never exposes raw server text', () => {
      const unsafeErr = new ApiClientError(
        'Path traversal (..) is not allowed in extraction [ZIP_UNSAFE_PATH]',
        422,
        'ZIP_UNSAFE_PATH'
      );
      const manyFilesErr = new ApiClientError(
        'File count 2000 exceeds limit 1000 [ZIP_TOO_MANY_FILES]',
        422,
        'ZIP_TOO_MANY_FILES'
      );
      const bombErr = new ApiClientError(
        'Compression ratio 150 exceeds limit [ZIP_BOMB]',
        422,
        'ZIP_BOMB'
      );
      const largeErr = new ApiClientError(
        'Extracted bytes exceed limit [ZIP_TOO_LARGE]',
        422,
        'ZIP_TOO_LARGE'
      );

      const msg1 = getFriendlyErrorMessage(unsafeErr);
      const msg2 = getFriendlyErrorMessage(manyFilesErr);
      const msg3 = getFriendlyErrorMessage(bombErr);
      const msg4 = getFriendlyErrorMessage(largeErr);

      expect(msg1).toContain('Archive contains unsafe file paths [ZIP_UNSAFE_PATH]');
      expect(msg1).not.toContain('Path traversal (..)');

      expect(msg2).toContain('Archive contains too many files [ZIP_TOO_MANY_FILES]');
      expect(msg2).not.toContain('File count 2000');

      expect(msg3).toContain('Archive compression ratio is suspiciously high [ZIP_BOMB]');
      expect(msg3).not.toContain('Compression ratio 150');

      expect(msg4).toContain('Extracted archive size exceeds allowed limit [ZIP_TOO_LARGE]');
      expect(msg4).not.toContain('Extracted bytes exceed limit');
    });

    it('maps 429 to "Too many uploads at once, try again shortly"', () => {
      const err = new ApiClientError('Too many concurrent uploads', 429, 'TOO_MANY_UPLOADS');
      expect(getFriendlyErrorMessage(err)).toBe('Too many uploads at once, try again shortly');
    });

    it('maps network failures to "Backend is not reachable"', () => {
      const netErr = new TypeError('Failed to fetch');
      expect(getFriendlyErrorMessage(netErr)).toBe('Backend is not reachable');

      const clientNetErr = new ApiClientError('Connection refused', 0, 'NETWORK_ERROR');
      expect(getFriendlyErrorMessage(clientNetErr)).toBe('Backend is not reachable');
    });

    it('maps 404 to "Project not found"', () => {
      const err = new ApiClientError(error404Fixture.error, 404, 'NOT_FOUND');
      expect(getFriendlyErrorMessage(err)).toBe('Project not found');
    });
  });

  describe('Project Persistence in localStorage and Fallback', () => {
    it('persists selected project id and falls back to newest when stored id is gone', async () => {
      // Set an invalid stored ID that doesn't exist
      localStorage.setItem(STORAGE_KEY, 'non-existent-id');

      vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
      vi.spyOn(api, 'getSummary').mockResolvedValue(capturedSummary);

      render(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectsPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('projects-grid')).toBeInTheDocument();
      });

      // Should have fallen back to newest project (first in list: 0a98e8ea-c335-425e-94b9-c4bb7dd3a058)
      expect(localStorage.getItem(STORAGE_KEY)).toBe(capturedProjects[0].id);
    });

    it('falls back to null when stored id is gone and project list is empty', async () => {
      localStorage.setItem(STORAGE_KEY, 'some-old-id');
      vi.spyOn(api, 'getProjects').mockResolvedValue([]);

      render(
        <MemoryRouter>
          <ProjectProvider>
            <ProjectsPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Upload your first project')).toBeInTheDocument();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('Real Backend Contract Test', () => {
    // Skipped unless environment variable RIPPLE_CONTRACT=1 is set
    const shouldRunContract = process.env.RIPPLE_CONTRACT === '1';

    it.runIf(shouldRunContract)(
      'contract test: checks live backend response keys match captured fixture keys',
      async () => {
        const liveRes = await fetch('http://localhost:4000/api/projects');
        expect(liveRes.ok).toBe(true);

        const liveJson = await liveRes.json();
        expect(Object.keys(liveJson).sort()).toEqual(Object.keys(projectsListFixture).sort());

        if (liveJson.data && liveJson.data.length > 0) {
          const liveProjectKeys = Object.keys(liveJson.data[0]).sort();
          const fixtureProjectKeys = Object.keys(capturedProjects[0]).sort();
          expect(liveProjectKeys).toEqual(fixtureProjectKeys);

          // Test live summary endpoint
          const projectId = liveJson.data[0].id;
          const liveSummaryRes = await fetch(`http://localhost:4000/api/projects/${projectId}/summary`);
          expect(liveSummaryRes.ok).toBe(true);

          const liveSummaryJson = await liveSummaryRes.json();
          expect(Object.keys(liveSummaryJson.data).sort()).toEqual(
            Object.keys(capturedSummary).sort()
          );
        }
      }
    );
  });
});
