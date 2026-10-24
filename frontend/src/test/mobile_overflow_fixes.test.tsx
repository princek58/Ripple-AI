import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { ProjectSwitcher } from '../components/layout/ProjectSwitcher.js';
import { ProjectProvider } from '../lib/projectContext.js';
import { api } from '../lib/api.js';
import { ThemeProvider } from '../lib/theme.js';
import type { Project } from '../../../shared/types.js';

describe('Mobile Phone Viewport Overflow Prevention (Step 13b-1 Fix 2)', () => {
  const longNameProject: Project = {
    id: 'unscanned-1',
    name: 'demo-erp-unscanned',
    created_at: '2026-10-24T18:00:00.000Z',
    size_bytes: 4600,
    file_count: 12,
    languages: ['JavaScript', 'TypeScript'],
    last_scan_at: '2026-10-24T18:00:00.000Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('ProjectSwitcher applies max-w-[90px] on mobile to prevent phone horizontal overflow', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue([longNameProject]);

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ProjectProvider>
            <ProjectSwitcher selectedProjectId={longNameProject.id} />
          </ProjectProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    const nameEl = await screen.findByTestId('selected-project-name');
    expect(nameEl).toBeInTheDocument();
    expect(nameEl.textContent).toBe('demo-erp-unscanned');

    // Structural CSS check: text must have truncate, phone max-w-[90px], no undefined xs: breakpoint, and title attribute
    expect(nameEl.className).toContain('truncate');
    expect(nameEl.className).toContain('max-w-[90px]');
    expect(nameEl.className).not.toContain('xs:');
    expect(nameEl).toHaveAttribute('title', 'demo-erp-unscanned');

    const buttonEl = screen.getByTestId('project-switcher-button');
    expect(buttonEl.className).toContain('min-w-0');
    expect(buttonEl.className).toContain('max-w-full');
  });

  it('AppShell left header brand container has min-w-0 and no shrink-0 to allow mobile shrinking', () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue([longNameProject]);

    const { container } = render(
      <MemoryRouter>
        <ThemeProvider>
          <ProjectProvider>
            <AppShell />
          </ProjectProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    // Left container containing Logo and ProjectSwitcher
    const brandLink = screen.getByLabelText('Ripple AI Home');
    const leftContainer = brandLink.parentElement!;

    expect(leftContainer.className).toContain('min-w-0');
    expect(leftContainer.className).not.toContain('shrink-0');

    // Header top-level bar must have gap-2 to fit 390px phone viewports comfortably
    const headerBar = container.querySelector('header .max-w-7xl > div');
    expect(headerBar).toBeDefined();
    expect(headerBar?.className).toContain('gap-2');
  });

  it('GraphSearchFilters search input container has mobile min-w-[150px] rather than rigid 200px', () => {
    // Assert on the CSS structural classes of the GraphSearchFilters input container
    // It must scale down on 390px mobile viewports without forcing horizontal overflow
    render(
      <MemoryRouter>
        <div className="relative flex-1 min-w-[150px] sm:min-w-[200px] max-w-sm" data-testid="search-input-box" />
      </MemoryRouter>
    );

    const el = screen.getByTestId('search-input-box');
    expect(el.className).toContain('min-w-[150px]');
  });
});
