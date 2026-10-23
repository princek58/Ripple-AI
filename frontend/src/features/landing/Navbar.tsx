import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { Button } from '../../components/ui/Button.js';
import { ThemeToggle } from '../../lib/theme.js';

export interface NavbarProps {
  className?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ className = '' }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      data-testid="landing-navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 border-b ${
        isScrolled
          ? 'scrolled py-3 bg-theme-bg/85 backdrop-blur-md border-theme-border/80 shadow-sm'
          : 'py-5 bg-theme-bg/50 backdrop-blur-sm border-transparent'
      } ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo Wordmark "Ripple AI" */}
        <Link
          to="/"
          className="flex items-center gap-2.5 font-heading font-bold text-xl sm:text-2xl text-forest dark:text-lime tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime rounded-md"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-forest dark:bg-lime" aria-hidden="true" />
          <span>Ripple AI</span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav
          className="hidden md:flex items-center gap-6"
          aria-label="Main Navigation"
        >
          {/* Working section anchor */}
          <a
            href="#features"
            className="text-sm font-medium text-theme-text-muted hover:text-theme-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime rounded-md px-1.5 py-0.5"
          >
            Features
          </a>

          <a
            href="#how-it-works"
            className="text-sm font-medium text-theme-text-muted hover:text-theme-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime rounded-md px-1.5 py-0.5"
          >
            How it works
          </a>

          <a
            href="#safety"
            className="text-sm font-medium text-theme-text-muted hover:text-theme-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime rounded-md px-1.5 py-0.5"
          >
            Safety
          </a>

          {/* Docs: Visibly disabled, not yet implemented */}
          <span
            role="link"
            aria-disabled="true"
            title="Coming soon"
            className="text-sm font-medium text-theme-text-muted/40 cursor-not-allowed select-none inline-flex items-center gap-1.5 px-1.5 py-0.5"
          >
            Docs
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded border border-theme-border/60 bg-theme-surface/50 text-theme-text-muted/60">
              Soon
            </span>
          </span>

          {/* Log in: Visibly disabled, not yet implemented */}
          <span
            role="link"
            aria-disabled="true"
            title="Coming soon"
            className="text-sm font-medium text-theme-text-muted/40 cursor-not-allowed select-none inline-flex items-center gap-1.5 px-1.5 py-0.5"
          >
            Log in
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded border border-theme-border/60 bg-theme-surface/50 text-theme-text-muted/60">
              Soon
            </span>
          </span>
        </nav>

        {/* Action Buttons & Theme Toggle */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link to="/app/projects">
            <Button
              variant="primary"
              size="sm"
              className="font-heading font-medium flex items-center gap-1.5"
            >
              <span>Start analysis</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            data-testid="mobile-menu-button"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-nav-panel"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg text-theme-text hover:bg-theme-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation panel */}
      {isMobileMenuOpen && (
        <div
          id="mobile-nav-panel"
          data-testid="mobile-nav-panel"
          className="md:hidden border-t border-theme-border/80 bg-theme-bg/95 backdrop-blur-md px-4 pt-3 pb-6 flex flex-col gap-3 mt-3 shadow-lg"
        >
          <a
            href="#features"
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-base font-medium text-theme-text py-2 border-b border-theme-border/40"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-base font-medium text-theme-text py-2 border-b border-theme-border/40"
          >
            How it works
          </a>
          <a
            href="#safety"
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-base font-medium text-theme-text py-2 border-b border-theme-border/40"
          >
            Safety
          </a>

          {/* Docs disabled */}
          <div
            role="link"
            aria-disabled="true"
            title="Coming soon"
            className="text-base font-medium text-theme-text-muted/40 cursor-not-allowed select-none flex items-center justify-between py-2 border-b border-theme-border/40"
          >
            <span>Docs</span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-theme-border/60 bg-theme-surface/50 text-theme-text-muted/60">
              Soon
            </span>
          </div>

          {/* Log in disabled */}
          <div
            role="link"
            aria-disabled="true"
            title="Coming soon"
            className="text-base font-medium text-theme-text-muted/40 cursor-not-allowed select-none flex items-center justify-between py-2 border-b border-theme-border/40"
          >
            <span>Log in</span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-theme-border/60 bg-theme-surface/50 text-theme-text-muted/60">
              Soon
            </span>
          </div>

          <div className="pt-2">
            <Link to="/app/projects" onClick={() => setIsMobileMenuOpen(false)}>
              <Button variant="primary" className="w-full justify-center">
                Start analysis
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
