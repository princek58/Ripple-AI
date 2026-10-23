import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopPillNav, NAV_ITEMS } from '../components/layout/TopPillNav.js';
import { ThemeProvider, ThemeToggle } from '../lib/theme.js';
import { AppRoutes } from '../App.js';
import { api } from '../lib/api.js';

describe('Navigation and Theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
    vi.restoreAllMocks();
    vi.spyOn(api, 'getProjects').mockResolvedValue([]);
  });

  describe('TopPillNav', () => {
    it('renders exactly all 7 nav items with proper links', () => {
      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <TopPillNav />
        </MemoryRouter>
      );

      expect(NAV_ITEMS).toHaveLength(7);

      const expectedNames = [
        'Overview',
        'Projects',
        'Graph',
        'Investigations',
        'Fixes',
        'Tests',
        'Reports',
      ];

      expectedNames.forEach((name) => {
        const link = screen.getByRole('link', { name: new RegExp(name, 'i') });
        expect(link).toBeInTheDocument();
      });
    });

    it('highlights active item with text and style, not colour alone', () => {
      render(
        <MemoryRouter initialEntries={['/app/graph']}>
          <TopPillNav />
        </MemoryRouter>
      );

      const activeLink = screen.getByRole('link', { name: /graph/i });
      expect(activeLink).toHaveAttribute('aria-current', 'page');
      expect(activeLink.className).toContain('font-bold');

      // Check the indicator dot or screen-reader text is rendered
      expect(activeLink.textContent).toContain('(current page)');
    });
  });

  describe('ThemeToggle and ThemeProvider', () => {

    it('defaults to light theme and allows toggling to dark and back', () => {
      render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );

      // Light theme default
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem('ripple_theme')).toBe('light');

      const toggleBtn = screen.getByTestId('theme-toggle');
      expect(toggleBtn).toHaveAttribute('aria-label', 'Switch to dark theme');

      // Click to toggle to dark
      fireEvent.click(toggleBtn);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('ripple_theme')).toBe('dark');
      expect(toggleBtn).toHaveAttribute('aria-label', 'Switch to light theme');

      // Click to toggle back to light
      fireEvent.click(toggleBtn);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem('ripple_theme')).toBe('light');
    });

    it('persists and restores theme choice from localStorage', () => {
      localStorage.setItem('ripple_theme', 'dark');

      render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('respects system prefers-color-scheme on first visit when localStorage is empty', () => {
      // Mock matchMedia for dark mode
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('Routing (React Router)', () => {
    it('renders landing page at "/" with "Ripple AI" brand, hero heading, and Sample data tag', () => {
      render(
        <ThemeProvider>
          <MemoryRouter initialEntries={['/']}>
            <AppRoutes />
          </MemoryRouter>
        </ThemeProvider>
      );

      expect(screen.getAllByText('Ripple AI').length).toBeGreaterThan(0);
      expect(
        screen.getByRole('heading', { level: 1, name: /understand why it breaks, with evidence/i })
      ).toBeInTheDocument();
      expect(screen.getAllByTestId('sample-data-tag').length).toBeGreaterThan(0);
    });

    it('renders app shell and placeholder page at "/app/overview"', async () => {
      render(
        <ThemeProvider>
          <MemoryRouter initialEntries={['/app/overview']}>
            <AppRoutes />
          </MemoryRouter>
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
      });
      expect(screen.getByText('Coming in Step 10')).toBeInTheDocument();
    });

    it('renders dev design system page at "/dev/design-system"', async () => {
      render(
        <ThemeProvider>
          <MemoryRouter initialEntries={['/dev/design-system']}>
            <AppRoutes />
          </MemoryRouter>
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'Design System & Tokens' })
        ).toBeInTheDocument();
      });
      expect(screen.getByText(/Interactive preview of Ripple AI components/i)).toBeInTheDocument();
    });

    it('renders 404 NotFound page on unknown routes', () => {
      render(
        <ThemeProvider>
          <MemoryRouter initialEntries={['/nonexistent-route']}>
            <AppRoutes />
          </MemoryRouter>
        </ThemeProvider>
      );

      expect(screen.getByRole('heading', { level: 1, name: 'Page Not Found' })).toBeInTheDocument();
      expect(screen.getByText('404')).toBeInTheDocument();
    });
  });
});

