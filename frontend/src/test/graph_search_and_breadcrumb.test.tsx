import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { GraphSearchFilters } from '../features/graph/GraphSearchFilters.js';
import { GraphBreadcrumb } from '../features/graph/GraphBreadcrumb.js';
import { GraphPage } from '../features/graph/GraphPage.js';
import { ProjectProvider } from '../lib/projectContext.js';
import { api } from '../lib/api.js';

// Real API Fixtures
import searchNoticeFixture from './fixtures/api/graph_search_notice.json';
import searchEmptyFixture from './fixtures/api/graph_search_empty.json';
import searchTypeApiFixture from './fixtures/api/graph_search_type_api.json';
import projectsListFixture from './fixtures/api/projects_list.json';
import graphLevel1Fixture from './fixtures/api/graph_level1.json';

const capturedProjects = projectsListFixture.data;

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="test-location">{location.pathname}{location.search}</div>;
}

describe('GraphSearchFilters & Breadcrumbs (Step 11b Part A)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('debounces text search input (300ms) so only the last query is sent', async () => {
    vi.useFakeTimers();
    const searchSpy = vi.spyOn(api, 'searchGraph').mockResolvedValue(searchNoticeFixture.data as any);
    const onSelectMock = vi.fn();

    render(
      <GraphSearchFilters projectId="proj-1" onSelectResult={onSelectMock} />
    );

    const input = screen.getByLabelText('Search nodes');

    // Type rapidly
    fireEvent.change(input, { target: { value: 'n' } });
    fireEvent.change(input, { target: { value: 'no' } });
    fireEvent.change(input, { target: { value: 'not' } });
    fireEvent.change(input, { target: { value: 'notice' } });

    // Before timer fires, no call
    expect(searchSpy).not.toHaveBeenCalled();

    // Fast-forward debounce time
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({ q: 'notice' }),
      expect.any(AbortSignal)
    );

    vi.useRealTimers();
  });

  it('aborts stale in-flight request when query updates before previous finishes', async () => {
    vi.useFakeTimers();
    let capturedSignal1: AbortSignal | undefined;

    const searchSpy = vi.spyOn(api, 'searchGraph').mockImplementation(async (_pid, params, signal) => {
      if (params.q === 'first') {
        capturedSignal1 = signal;
        return new Promise(() => {}); // never finishes
      }
      return searchNoticeFixture.data as any;
    });

    render(<GraphSearchFilters projectId="proj-1" onSelectResult={vi.fn()} />);
    const input = screen.getByLabelText('Search nodes');

    fireEvent.change(input, { target: { value: 'first' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(capturedSignal1).toBeDefined();
    expect(capturedSignal1?.aborted).toBe(false);

    // Now type a new query
    fireEvent.change(input, { target: { value: 'second' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Previous request signal must be aborted
    expect(capturedSignal1?.aborted).toBe(true);
    expect(searchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('filters by type, severity, and verification producing the right query parameters', async () => {
    vi.useFakeTimers();
    const searchSpy = vi.spyOn(api, 'searchGraph').mockResolvedValue(searchTypeApiFixture.data as any);

    render(<GraphSearchFilters projectId="proj-1" onSelectResult={vi.fn()} />);

    // Select Type
    const typeSelect = screen.getByLabelText('Filter by type');
    fireEvent.change(typeSelect, { target: { value: 'api' } });

    // Select Severity
    const sevSelect = screen.getByLabelText('Filter by severity');
    fireEvent.change(sevSelect, { target: { value: 'high' } });

    // Select Verification
    const verSelect = screen.getByLabelText('Filter by verification');
    fireEvent.change(verSelect, { target: { value: 'reproduced' } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(searchSpy).toHaveBeenCalledWith(
      'proj-1',
      {
        q: undefined,
        type: 'api',
        severity: 'high',
        verification: 'reproduced',
        limit: 25,
      },
      expect.any(AbortSignal)
    );

    vi.useRealTimers();
  });

  it('displays "No matching nodes" message when search returns empty results', async () => {
    vi.spyOn(api, 'searchGraph').mockResolvedValue(searchEmptyFixture.data as any);

    render(<GraphSearchFilters projectId="proj-1" onSelectResult={vi.fn()} />);
    const input = screen.getByLabelText('Search nodes');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'zzzz' } });
      await new Promise((r) => setTimeout(r, 350));
    });

    await waitFor(() => {
      expect(screen.getByTestId('no-matching-nodes')).toHaveTextContent('No matching nodes');
    });
  });

  it('navigates URL focus when a search result is clicked (module -> level 2, file -> level 3)', async () => {
    vi.spyOn(api, 'searchGraph').mockResolvedValue(searchNoticeFixture.data as any);
    vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
    vi.spyOn(api, 'getGraph').mockResolvedValue(graphLevel1Fixture.data as any);

    render(
      <MemoryRouter initialEntries={['/app/graph?level=1']}>
        <ProjectProvider>
          <LocationDisplay />
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Search nodes')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Search nodes');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'notice' } });
      await new Promise((r) => setTimeout(r, 350));
    });

    // The first item in graph_search_notice is the notices module
    const firstResult = await screen.findByTestId(`search-result-${searchNoticeFixture.data.items[0].id}`);
    expect(firstResult).toBeInTheDocument();

    // Click module result
    await act(async () => {
      fireEvent.click(firstResult);
    });

    // Module should navigate to level 2 with focus
    await waitFor(() => {
      expect(screen.getByTestId('test-location')).toHaveTextContent('level=2');
      expect(screen.getByTestId('test-location')).toHaveTextContent(`focus=${searchNoticeFixture.data.items[0].id}`);
    });
  });

  it('resets query and filters when Clear filters button is clicked', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'searchGraph').mockResolvedValue(searchNoticeFixture.data as any);

    render(<GraphSearchFilters projectId="proj-1" onSelectResult={vi.fn()} />);
    const input = screen.getByLabelText('Search nodes') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'notice' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    const clearBtn = screen.getByTestId('clear-filters-btn');
    expect(clearBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(clearBtn);
    });

    expect(input.value).toBe('');
    expect(screen.queryByTestId('search-results-dropdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('clear-filters-btn')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('renders breadcrumb links and sets aria-current on the current crumb', () => {
    const project = { id: 'p1', name: 'Demo ERP' };
    const parentModule = { id: 'm-fees', label: 'fees', path: 'module:fees' };
    const currentNode = { id: 'n-fees-js', label: 'fees.js', type: 'backend' as const };

    // Level 1: Project only
    const { rerender } = render(
      <MemoryRouter>
        <GraphBreadcrumb
          project={project as any}
          parentModule={null}
          currentNode={null}
          currentLevel={1}
        />
      </MemoryRouter>
    );

    const projectCrumb = screen.getByText('Demo ERP');
    expect(projectCrumb).toHaveAttribute('aria-current', 'page');
    expect(projectCrumb.tagName.toLowerCase()).toBe('span');

    // Level 2: Project link > Module current
    rerender(
      <MemoryRouter>
        <GraphBreadcrumb
          project={project as any}
          parentModule={parentModule}
          currentNode={{ id: 'm-fees', label: 'fees', type: 'module' }}
          currentLevel={2}
        />
      </MemoryRouter>
    );

    const projectLink = screen.getByRole('link', { name: 'Demo ERP' });
    expect(projectLink).toHaveAttribute('href', '/app/graph?level=1');
    const moduleCrumb = screen.getByText('fees');
    expect(moduleCrumb).toHaveAttribute('aria-current', 'page');

    // Level 3: Project link > Module link > Node current
    rerender(
      <MemoryRouter>
        <GraphBreadcrumb
          project={project as any}
          parentModule={parentModule}
          currentNode={currentNode}
          currentLevel={3}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Demo ERP' })).toHaveAttribute('href', '/app/graph?level=1');
    expect(screen.getByRole('link', { name: 'fees' })).toHaveAttribute(
      'href',
      '/app/graph?level=2&focus=m-fees'
    );
    const nodeCrumb = screen.getByText('fees.js');
    expect(nodeCrumb).toHaveAttribute('aria-current', 'page');
  });

  it('switching project clears search and aborts in-flight request', async () => {
    vi.useFakeTimers();
    let aborted = false;
    vi.spyOn(api, 'searchGraph').mockImplementation(async (_pid, _params, signal) => {
      signal?.addEventListener('abort', () => {
        aborted = true;
      });
      return new Promise(() => {}); // never finishes
    });

    const { rerender } = render(
      <GraphSearchFilters projectId="proj-1" onSelectResult={vi.fn()} />
    );

    const input = screen.getByLabelText('Search nodes') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'query1' } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Switch project
    rerender(<GraphSearchFilters projectId="proj-2" onSelectResult={vi.fn()} />);

    expect(aborted).toBe(true);
    expect(input.value).toBe('');
    expect(screen.queryByTestId('search-results-dropdown')).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
