import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LandingPage } from '../pages/LandingPage.js';
import { Navbar } from '../features/landing/Navbar.js';
import { HeroGraph } from '../features/landing/HeroGraph.js';
import { TechStrip } from '../features/landing/TechStrip.js';
import { BentoGrid } from '../features/landing/BentoGrid.js';
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

describe('Landing Page Part 1 (Step 9a)', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // Default matchMedia mock (normal motion)
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

  describe('Heading and SEO', () => {
    it('renders exactly one h1 with the headline text', () => {
      renderLanding();
      const h1Elements = screen.getAllByRole('heading', { level: 1 });
      expect(h1Elements).toHaveLength(1);
      expect(h1Elements[0]).toHaveTextContent('Understand why it breaks, with evidence');
    });
  });

  describe('Hero Section', () => {
    it('both hero buttons have the right targets', () => {
      renderLanding();
      const hero = screen.getByTestId('hero-section');

      // "Upload a project" button link -> /app/projects
      const uploadButton = within(hero).getByRole('button', { name: /upload a project/i });
      const uploadLink = uploadButton.closest('a');
      expect(uploadLink).toBeInTheDocument();
      expect(uploadLink).toHaveAttribute('href', '/app/projects');

      // "See how it works" button link -> #how-it-works
      const seeHowButton = within(hero).getByRole('button', { name: /see how it works/i });
      const seeHowLink = seeHowButton.closest('a');
      expect(seeHowLink).toBeInTheDocument();
      expect(seeHowLink).toHaveAttribute('href', '#how-it-works');
    });

    it('renders the evidence-first debugging badge', () => {
      renderLanding();
      const hero = screen.getByTestId('hero-section');
      expect(within(hero).getByText(/evidence-first debugging/i)).toBeInTheDocument();
    });
  });

  describe('Navbar', () => {
    it('Docs and Log in are visibly aria-disabled and not working links', () => {
      renderLanding();

      const docsElements = screen.getAllByText(/docs/i);
      const docsItem = docsElements[0].closest('[aria-disabled="true"]');
      expect(docsItem).toBeInTheDocument();
      expect(docsItem).toHaveAttribute('aria-disabled', 'true');
      expect(docsItem?.tagName.toLowerCase()).not.toBe('a');
      expect(docsItem).toHaveAttribute('title', 'Coming soon');

      const loginElements = screen.getAllByText(/log in/i);
      const loginItem = loginElements[0].closest('[aria-disabled="true"]');
      expect(loginItem).toBeInTheDocument();
      expect(loginItem).toHaveAttribute('aria-disabled', 'true');
      expect(loginItem?.tagName.toLowerCase()).not.toBe('a');
      expect(loginItem).toHaveAttribute('title', 'Coming soon');
    });

    it('Navbar shows the mobile menu when toggled and the scrolled class changes after a scroll event', () => {
      render(
        <ThemeProvider>
          <BrowserRouter>
            <Navbar />
          </BrowserRouter>
        </ThemeProvider>
      );

      const navHeader = screen.getByTestId('landing-navbar');
      expect(navHeader).not.toHaveClass('scrolled');

      // Test scroll event triggers scrolled class
      Object.defineProperty(window, 'scrollY', { value: 50, writable: true });
      fireEvent.scroll(window);
      expect(navHeader).toHaveClass('scrolled');

      // Reset scroll
      Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
      fireEvent.scroll(window);
      expect(navHeader).not.toHaveClass('scrolled');

      // Test mobile menu toggle
      expect(screen.queryByTestId('mobile-nav-panel')).not.toBeInTheDocument();

      const toggleButton = screen.getByTestId('mobile-menu-button');
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(toggleButton);
      expect(screen.getByTestId('mobile-nav-panel')).toBeInTheDocument();
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(toggleButton);
      expect(screen.queryByTestId('mobile-nav-panel')).not.toBeInTheDocument();
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('HeroGraph', () => {
    it('HeroGraph shows the "Critical (sample)" label with an icon', () => {
      render(<HeroGraph />);
      const criticalBadge = screen.getByText('Critical (sample)');
      expect(criticalBadge).toBeInTheDocument();

      const badgeParent = criticalBadge.closest('[data-testid="severity-badge-critical"]');
      expect(badgeParent).toBeInTheDocument();

      // Check SVG icon exists inside the badge
      const icon = badgeParent?.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');

      // Check node chips exist
      expect(screen.getByText('Notice Page')).toBeInTheDocument();
      expect(screen.getByText('Notice API')).toBeInTheDocument();
      expect(screen.getByText('Storage')).toBeInTheDocument();

      // Check SampleDataTag exists on graph
      expect(screen.getByTestId('sample-data-tag')).toBeInTheDocument();
    });

    it('under a mocked prefers-reduced-motion the pulse/ripple elements are not rendered or have no animation class', () => {
      // 1. In standard motion, ripple elements exist
      const { unmount } = render(<HeroGraph forceReducedMotion={false} />);
      expect(screen.getByTestId('ripple-elements-container')).toBeInTheDocument();
      expect(screen.getByTestId('storage-pulse')).toBeInTheDocument();
      unmount();

      // 2. Under prefers-reduced-motion, pulse and ripple elements are NOT rendered
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

      const { container } = render(<HeroGraph />);
      expect(screen.queryByTestId('ripple-elements-container')).not.toBeInTheDocument();
      expect(screen.queryByTestId('storage-pulse')).not.toBeInTheDocument();

      // Ensure no pulse or ping animation classes exist in the graph
      const animatedElements = container.querySelectorAll('.animate-pulse, .animate-ping');
      expect(animatedElements).toHaveLength(0);
    });
  });

  describe('TechStrip', () => {
    it('renders heading and real technology names only without external images', () => {
      const { container } = render(<TechStrip />);
      expect(screen.getByText('Works with the code you already have')).toBeInTheDocument();

      const techs = [
        'React',
        'Node.js',
        'Express',
        'TypeScript',
        'Python',
        'MongoDB',
        'MySQL',
        'GitHub',
      ];

      for (const tech of techs) {
        expect(screen.getByText(tech)).toBeInTheDocument();
      }

      // No image tags
      expect(container.querySelectorAll('img')).toHaveLength(0);
    });
  });

  describe('BentoGrid', () => {
    it('has id="features", exactly 4 cards, and each card has a "Sample data" tag', () => {
      const { container } = render(<BentoGrid />);
      const section = container.querySelector('#features');
      expect(section).toBeInTheDocument();

      const cards = screen.getAllByTestId('bento-card');
      expect(cards).toHaveLength(4);

      // Verify each card contains a SampleDataTag
      for (const card of cards) {
        const sampleTag = within(card).getByTestId('sample-data-tag');
        expect(sampleTag).toBeInTheDocument();
        expect(sampleTag).toHaveTextContent(/sample data/i);
      }

      // Verify specific mockups in the 4 cards:
      // a) Layered graph: L1 Project, L2 Module, L3 Code, L4 Evidence
      expect(screen.getByText('L1 Project')).toBeInTheDocument();
      expect(screen.getByText('L2 Module')).toBeInTheDocument();
      expect(screen.getByText('L3 Code')).toBeInTheDocument();
      expect(screen.getByText('L4 Evidence')).toBeInTheDocument();

      // b) Evidence & confidence report: severity, confidence, verification badges + What is not confirmed
      expect(screen.getByTestId('mockup-evidence-report')).toBeInTheDocument();
      expect(screen.getByText(/what is not confirmed:/i)).toBeInTheDocument();

      // c) Fix preview with approval: tiny diff, Approve/Reject buttons, text: Suggested change, not applied, not tested
      expect(screen.getByText(/suggested change, not applied, not tested/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();

      // d) Safe by default: read-only by default, uploaded code is never executed, secret values are never shown
      expect(screen.getByText(/read-only by default/i)).toBeInTheDocument();
      expect(screen.getByText(/uploaded code is never executed/i)).toBeInTheDocument();
      expect(screen.getByText(/secret values are never shown/i)).toBeInTheDocument();
    });
  });

  describe('Copy and Anti-Dark-Pattern Rules', () => {
    it('contains no forbidden copy (testimonial, "trusted by", "users", "customers") and no external images', () => {
      const { container } = renderLanding();
      const fullText = container.textContent || '';

      const forbidden = ['testimonial', 'trusted by', 'users', 'customers'];
      for (const phrase of forbidden) {
        expect(fullText.toLowerCase()).not.toContain(phrase);
      }

      // Ensure no <img> pointing to external URLs
      const images = container.querySelectorAll('img');
      for (const img of Array.from(images)) {
        const src = img.getAttribute('src') || '';
        expect(src.startsWith('http://') || src.startsWith('https://')).toBe(false);
      }
    });
  });
});
