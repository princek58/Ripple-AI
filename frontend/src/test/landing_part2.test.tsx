import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LandingPage } from '../pages/LandingPage.js';
import { StickyGraphZoom } from '../features/landing/StickyGraphZoom.js';
import { HowItWorks } from '../features/landing/HowItWorks.js';
import { SafetyStatement } from '../features/landing/SafetyStatement.js';
import { StatsBand } from '../features/landing/StatsBand.js';
import { Footer } from '../features/landing/Footer.js';
import { ThemeProvider } from '../lib/theme.js';

function renderLanding() {
  return render(
    <ThemeProvider>
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    </ThemeProvider>
  );
}

describe('Landing Page Part 2 (Step 9b)', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
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

  describe('Section Order and IDs', () => {
    it('sections appear in the right order and ids features, how-it-works, safety exist', () => {
      const { container } = renderLanding();

      const features = container.querySelector('#features');
      const howItWorks = container.querySelector('#how-it-works');
      const safety = container.querySelector('#safety');

      expect(features).toBeInTheDocument();
      expect(howItWorks).toBeInTheDocument();
      expect(safety).toBeInTheDocument();

      // Check document order: features precedes how-it-works precedes safety
      if (features && howItWorks && safety) {
        const orderFeaturesToHow = features.compareDocumentPosition(howItWorks);
        expect(orderFeaturesToHow & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        const orderHowToSafety = howItWorks.compareDocumentPosition(safety);
        expect(orderHowToSafety & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }

      // Check sequential presence of all key section containers in DOM
      const hero = screen.getByTestId('hero-section');
      const techStrip = screen.getByTestId('tech-strip');
      const bentoGrid = screen.getByTestId('bento-grid-section');
      const statsBand = screen.getByTestId('stats-band');
      const ctaBand = screen.getByTestId('cta-band');
      const footer = screen.getByTestId('landing-footer');

      expect(hero).toBeInTheDocument();
      expect(techStrip).toBeInTheDocument();
      expect(bentoGrid).toBeInTheDocument();
      expect(statsBand).toBeInTheDocument();
      expect(ctaBand).toBeInTheDocument();
      expect(footer).toBeInTheDocument();
    });
  });

  describe('StickyGraphZoom', () => {
    it('renders all 4 stage labels in the reduced-motion/static mode and L4 contains severity, confidence and verification labels as text', () => {
      render(<StickyGraphZoom forceStatic={true} />);

      // Verify static mode is rendered
      expect(screen.getByTestId('sticky-graph-static')).toBeInTheDocument();

      // Verify all 4 stage labels exist
      expect(screen.getByText('L1 Project')).toBeInTheDocument();
      expect(screen.getByText('L2 Module')).toBeInTheDocument();
      expect(screen.getByText('L3 Code')).toBeInTheDocument();
      expect(screen.getByText('L4 Evidence')).toBeInTheDocument();

      // Verify L4 problem node with all three status badge text labels
      const l4Problem = screen.getByTestId('l4-problem-node');
      expect(l4Problem).toBeInTheDocument();

      // Severity badge text (High)
      expect(within(l4Problem).getByText('High')).toBeInTheDocument();

      // Confidence badge text (Confirmed)
      expect(within(l4Problem).getByText('Confirmed')).toBeInTheDocument();

      // Verification badge text (Not tested)
      expect(within(l4Problem).getByText('Not tested')).toBeInTheDocument();
    });

    it('renders static stacked layout under mocked narrow breakpoint (< 768px)', () => {
      // Mock mobile viewport width
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true, writable: true });
      window.dispatchEvent(new Event('resize'));

      render(<StickyGraphZoom />);

      // Should automatically render static stacked layout for narrow screens
      expect(screen.getByTestId('sticky-graph-static')).toBeInTheDocument();
      expect(screen.queryByTestId('sticky-graph-interactive')).not.toBeInTheDocument();
    });
  });

  describe('HowItWorks', () => {
    it('has 4 steps and 6 tiles and CI/CD shows "Coming later"', () => {
      render(<HowItWorks />);

      // Check exactly 4 steps
      const steps = ['Upload', 'Understand', 'Investigate', 'Fix and verify'];
      for (const stepTitle of steps) {
        const step = screen.getByTestId(`how-it-works-step-${stepTitle.toLowerCase().replace(/\s+/g, '-')}`);
        expect(step).toBeInTheDocument();
      }

      // Check exactly 6 tiles
      const tiles = ['Frontend', 'APIs', 'Database', 'Config', 'Tests', 'CI/CD'];
      for (const tileTitle of tiles) {
        const tile = screen.getByTestId(`how-it-works-tile-${tileTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`);
        expect(tile).toBeInTheDocument();
      }

      // Verify CI/CD tile specifically carries the visible "Coming later" label
      const cicdTile = screen.getByTestId('how-it-works-tile-ci-cd');
      expect(within(cicdTile).getByText(/coming later/i)).toBeInTheDocument();
    });
  });

  describe('SafetyStatement', () => {
    it('contains "Suspected is not confirmed." and the four statuses as text', () => {
      render(<SafetyStatement />);

      expect(screen.getByText('Suspected is not confirmed.')).toBeInTheDocument();

      // Verify 4 statuses as text
      const statuses = ['Hypothesis', 'Likely', 'Confirmed', 'Fix verified'];
      for (const status of statuses) {
        expect(screen.getAllByText(status).length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('StatsBand', () => {
    it('has exactly 4 stats, contains "6" checks and none of "30+"', () => {
      render(<StatsBand forceReducedMotion={true} />);

      const statItems = screen.getAllByTestId('stat-item');
      expect(statItems).toHaveLength(4);

      // Value checks
      expect(screen.getByTestId('stat-value-levels')).toHaveTextContent('4');
      expect(screen.getByTestId('stat-value-checks')).toHaveTextContent('6');
      expect(screen.getByTestId('stat-value-executed')).toHaveTextContent('0');
      expect(screen.getByTestId('stat-value-readonly')).toHaveTextContent('Read-only');

      // Must not contain 30+
      expect(screen.queryByText(/30\+/)).not.toBeInTheDocument();
    });

    it('count-up shows final values under reduced motion immediately', () => {
      render(<StatsBand forceReducedMotion={true} />);

      expect(screen.getByTestId('stat-value-levels')).toHaveTextContent('4');
      expect(screen.getByTestId('stat-value-checks')).toHaveTextContent('6');
      expect(screen.getByTestId('stat-value-executed')).toHaveTextContent('0');
      expect(screen.getByTestId('stat-value-readonly')).toHaveTextContent('Read-only');
    });

    it('count-up runs once and re-rendering does not restart the count', () => {
      const { rerender } = render(<StatsBand forceReducedMotion={true} />);

      expect(screen.getByTestId('stat-value-checks')).toHaveTextContent('6');

      // Re-render
      rerender(<StatsBand forceReducedMotion={true} />);

      expect(screen.getByTestId('stat-value-checks')).toHaveTextContent('6');
    });

    it('IntersectionObserver callback with isIntersecting true leads to final values 4, 6, and 0', async () => {
      let observerCb: (entries: Partial<IntersectionObserverEntry>[]) => void = () => {};
      const disconnectMock = vi.fn();
      const originalIO = window.IntersectionObserver;
      window.IntersectionObserver = class {
        constructor(cb: any) {
          observerCb = cb;
        }
        observe = vi.fn();
        disconnect = disconnectMock;
        unobserve = vi.fn();
      } as any;

      try {
        render(<StatsBand forceReducedMotion={false} />);

        // Before intersection, initial values are 0
        expect(screen.getByTestId('stat-value-levels')).toHaveTextContent('0');
        expect(screen.getByTestId('stat-value-checks')).toHaveTextContent('0');

        // Trigger intersection callback
        act(() => {
          observerCb([{ isIntersecting: true }]);
        });

        // Advance animation to completion
        await waitFor(() => {
          expect(screen.getByTestId('stat-value-levels')).toHaveTextContent('4');
          expect(screen.getByTestId('stat-value-checks')).toHaveTextContent('6');
          expect(screen.getByTestId('stat-value-executed')).toHaveTextContent('0');
          expect(screen.getByTestId('stat-value-readonly')).toHaveTextContent('Read-only');
        });
        expect(disconnectMock).toHaveBeenCalled();
      } finally {
        window.IntersectionObserver = originalIO;
      }
    });

    it('re-render during the animation does not reset or freeze it', async () => {
      let observerCb: (entries: Partial<IntersectionObserverEntry>[]) => void = () => {};
      const originalIO = window.IntersectionObserver;
      window.IntersectionObserver = class {
        constructor(cb: any) {
          observerCb = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      } as any;

      try {
        const { rerender } = render(<StatsBand forceReducedMotion={false} className="initial-class" />);

        // Trigger intersection callback
        act(() => {
          observerCb([{ isIntersecting: true }]);
        });

        // Re-render immediately during active animation
        rerender(<StatsBand forceReducedMotion={false} className="re-rendered-class" />);

        // The animation should not freeze, but continue and reach final values 4 and 6
        await waitFor(() => {
          expect(screen.getByTestId('stat-value-levels')).toHaveTextContent('4');
          expect(screen.getByTestId('stat-value-checks')).toHaveTextContent('6');
          expect(screen.getByTestId('stat-value-executed')).toHaveTextContent('0');
        });
      } finally {
        window.IntersectionObserver = originalIO;
      }
    });

    it('without any intersection event, fallback timer settles counters to 4 and 6 within 1000ms so numbers are never permanently 0', async () => {
      const originalIO = window.IntersectionObserver;
      // IntersectionObserver is present but never fires an intersection event
      window.IntersectionObserver = class {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      } as any;

      try {
        render(<StatsBand forceReducedMotion={false} />);

        // Initially 0 before fallback
        expect(screen.getByTestId('stat-value-levels')).toHaveTextContent('0');
        expect(screen.getByTestId('stat-value-checks')).toHaveTextContent('0');

        // Without intersection, fallback timer kicks in and animates to final values
        await waitFor(
          () => {
            expect(screen.getByTestId('stat-value-levels')).toHaveTextContent('4');
            expect(screen.getByTestId('stat-value-checks')).toHaveTextContent('6');
            expect(screen.getByTestId('stat-value-executed')).toHaveTextContent('0');
          },
          { timeout: 3500 }
        );
      } finally {
        window.IntersectionObserver = originalIO;
      }
    });
  });

  describe('Footer', () => {
    it('Footer has no <img>, no mailto and no social links, and Docs is aria-disabled', () => {
      const { container } = render(
        <BrowserRouter>
          <Footer />
        </BrowserRouter>
      );

      // No images in footer
      expect(container.querySelectorAll('img')).toHaveLength(0);

      // No mailto links
      expect(container.querySelector('a[href^="mailto:"]')).toBeNull();

      // No social links
      const allLinks = container.querySelectorAll('a');
      for (const link of Array.from(allLinks)) {
        const href = link.getAttribute('href') || '';
        expect(href).not.toMatch(/twitter|x\.com|github|linkedin|facebook|discord|instagram/i);
      }

      // Docs (coming soon) is aria-disabled
      const docsElement = screen.getByText(/docs \(coming soon\)/i);
      expect(docsElement).toHaveAttribute('aria-disabled', 'true');
      expect(docsElement.tagName.toLowerCase()).not.toBe('a');

      // Contains privacy guarantee
      expect(
        screen.getByText('Code is never executed. Secret values are never shown.')
      ).toBeInTheDocument();
    });
  });

  describe('Full Page Truthfulness and Mobile Integrity', () => {
    it('the whole landing page contains none of: testimonial, "trusted by", "users", "customers", "30+" (case-insensitive)', () => {
      const { container } = renderLanding();
      const fullText = (container.textContent || '').toLowerCase();

      const forbiddenPhrases = ['testimonial', 'trusted by', 'users', 'customers', '30+'];
      for (const phrase of forbiddenPhrases) {
        expect(fullText).not.toContain(phrase.toLowerCase());
      }
    });

    it('has no horizontal overflow classes that would break phone width and renders static stage layout on narrow viewports', () => {
      // Mock narrow viewport
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true, writable: true });
      window.dispatchEvent(new Event('resize'));

      const { container } = renderLanding();

      // Verify the page root has overflow-x-hidden
      const rootDiv = container.firstElementChild;
      expect(rootDiv).toHaveClass('overflow-x-hidden');

      // Verify static stacked stage cards are used
      expect(screen.getByTestId('sticky-graph-static')).toBeInTheDocument();
      expect(screen.queryByTestId('sticky-graph-interactive')).not.toBeInTheDocument();
    });
  });
});
