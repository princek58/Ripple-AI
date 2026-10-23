import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ProjectSwitcher } from '../components/layout/ProjectSwitcher.js';
import { api, ApiClientError } from '../lib/api.js';
import type { Project } from '../../../shared/types.js';

describe('ProjectSwitcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state "Upload your first project" when there are no projects', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue([]);

    render(<ProjectSwitcher />);

    // Initially loading
    expect(screen.getByTestId('project-switcher-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-empty')).toBeInTheDocument();
    });

    expect(screen.getByText('Upload your first project')).toBeInTheDocument();
  });

  it('shows list state with project name and allows selecting projects from dropdown', async () => {
    const mockProjects: Project[] = [
      {
        id: 'proj-1',
        name: 'ERP Backend Service',
        created_at: '2026-10-20T10:00:00Z',
        size_bytes: 1048576,
        file_count: 42,
        languages: ['TypeScript', 'JavaScript'],
        last_scan_at: '2026-10-20T10:05:00Z',
      },
      {
        id: 'proj-2',
        name: 'Notice Portal Frontend',
        created_at: '2026-10-21T11:00:00Z',
        size_bytes: 2048576,
        file_count: 88,
        languages: ['TypeScript', 'React'],
        last_scan_at: null,
      },
    ];

    vi.spyOn(api, 'getProjects').mockResolvedValue(mockProjects);
    const onSelectMock = vi.fn();

    render(<ProjectSwitcher onSelectProject={onSelectMock} />);

    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-button')).toBeInTheDocument();
    });

    // Default to first project
    expect(screen.getByTestId('selected-project-name')).toHaveTextContent('ERP Backend Service');

    // Click to open dropdown
    fireEvent.click(screen.getByTestId('project-switcher-button'));

    // Check both projects appear in listbox
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('ERP Backend Service');
    expect(options[1]).toHaveTextContent('Notice Portal Frontend');

    // Click second project
    fireEvent.click(options[1]);

    // Active project updates
    expect(screen.getByTestId('selected-project-name')).toHaveTextContent('Notice Portal Frontend');
    expect(onSelectMock).toHaveBeenCalledWith(mockProjects[1]);
  });

  it('shows error state when backend is down or returns error', async () => {
    vi.spyOn(api, 'getProjects').mockRejectedValue(
      new ApiClientError('Failed to fetch from backend', 503)
    );

    render(<ProjectSwitcher />);

    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Backend error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
