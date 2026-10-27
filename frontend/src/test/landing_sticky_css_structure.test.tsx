import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LandingPage } from '../pages/LandingPage.js';

import { ThemeProvider } from '../lib/theme.js';

describe('Landing Page Sticky Graph Zoom CSS Structure (Step L1 Part 2)', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true, writable: true });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  const renderLanding = () =>
    render(
      <ThemeProvider>
        <BrowserRouter>
          <LandingPage />
        </BrowserRouter>
      </ThemeProvider>
    );

  it('ensures no ancestor of the sticky stage uses overflow-hidden or overflow-x-hidden and that overflow-x-clip is present on the root', () => {
    const { container } = renderLanding();

    // 1. Root element has overflow-x-clip (preventing horizontal viewport overflow without breaking position: sticky)
    const rootEl = container.firstElementChild as HTMLElement;
    expect(rootEl).toBeInTheDocument();
    expect(rootEl.className).toContain('overflow-x-clip');
    expect(rootEl.className).not.toContain('overflow-x-hidden');
    expect(rootEl.className).not.toContain('overflow-hidden');

    // 2. Interactive sticky stage exists
    const interactiveSection = screen.getByTestId('sticky-graph-interactive');
    expect(interactiveSection).toBeInTheDocument();
    expect(interactiveSection.className).toContain('overflow-visible');

    const stickyStage = interactiveSection.querySelector('.sticky');
    expect(stickyStage).toBeInTheDocument();

    // 3. Walk all ancestors from the sticky stage up to the container root
    const offendingClasses = ['overflow-hidden', 'overflow-x-hidden', 'overflow-y-hidden'];
    let current: HTMLElement | null = stickyStage?.parentElement ?? null;
    const ancestorsVisited: string[] = [];

    while (current && current !== container) {
      ancestorsVisited.push(`${current.tagName.toLowerCase()}.${current.className}`);
      for (const cls of offendingClasses) {
        expect(
          current.classList.contains(cls),
          `Ancestor <${current.tagName.toLowerCase()} class="${current.className}"> must not have class "${cls}" because it breaks position: sticky`
        ).toBe(false);
      }
      current = current.parentElement;
    }

    // Ensure we traversed through main and the root div
    expect(ancestorsVisited.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * HONEST ASSESSMENT OF TEST CAPABILITY:
   * What this CSS-structure test CAN prove:
   * - It proves that the JSX markup and Tailwind utility class names on all ancestors of the sticky stage
   *   do not contain 'overflow-hidden' or 'overflow-x-hidden'.
   * - It proves that 'overflow-x-clip' is explicitly assigned to the page root container.
   *
   * What this CSS-structure test CANNOT prove:
   * - JSDOM does not implement CSS layout engines, box models, or scrolling geometry.
   * - It cannot prove that the browser's GPU compositor keeps `getBoundingClientRect().top` constant during scroll.
   * - It cannot prove that scroll progress calculations trigger stage transitions (L1 -> L2 -> L3 -> L4).
   * - Those behavioral guarantees MUST be proven by real-browser Playwright E2E tests (`frontend/e2e/qa.spec.ts`).
   */
  it('documents test limitations and verifies static fallback behavior is preserved for reduced motion', () => {
    // When prefers-reduced-motion is true, it must fall back to static stacked layout
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    renderLanding();
    expect(screen.getByTestId('sticky-graph-static')).toBeInTheDocument();
    expect(screen.queryByTestId('sticky-graph-interactive')).not.toBeInTheDocument();
  });
});
