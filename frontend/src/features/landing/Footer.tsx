import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC<{ className?: string }> = ({ className = '' }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      data-testid="landing-footer"
      className={`border-t border-theme-border/80 bg-theme-surface/60 py-12 px-4 sm:px-6 lg:px-8 ${className}`}
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-theme-border/60">
          {/* Logo Wordmark & Description */}
          <div className="flex flex-col gap-2 max-w-sm">
            <Link
              to="/"
              className="flex items-center gap-2 font-heading font-bold text-xl text-forest dark:text-lime tracking-tight"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-forest dark:bg-lime" aria-hidden="true" />
              <span>Ripple AI</span>
            </Link>
            <p className="text-xs text-theme-text-muted leading-relaxed">
              Static analysis, dependency graph, and evidence-first debugging for modern software projects.
            </p>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-wrap items-center gap-6 text-sm" aria-label="Footer Navigation">
            <a
              href="#features"
              className="text-theme-text-muted hover:text-theme-text transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-theme-text-muted hover:text-theme-text transition-colors"
            >
              How it works
            </a>
            <a
              href="#safety"
              className="text-theme-text-muted hover:text-theme-text transition-colors"
            >
              Safety
            </a>

            {/* Docs (coming soon) disabled item */}
            <span
              role="link"
              aria-disabled="true"
              title="Coming soon"
              className="text-theme-text-muted/40 cursor-not-allowed select-none inline-flex items-center gap-1.5"
            >
              Docs (coming soon)
            </span>
          </nav>
        </div>

        {/* Safety statement and copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-theme-text-muted">
          <div>
            <span>Code is never executed. Secret values are never shown.</span>
          </div>
          <div>
            <span>&copy; {currentYear} Ripple AI. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
