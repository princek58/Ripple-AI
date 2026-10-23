import React from 'react';
import { Link } from 'react-router-dom';
import { SampleDataTag } from '../components/ui/SampleDataTag.js';
import { Button } from '../components/ui/Button.js';
import { ThemeToggle } from '../lib/theme.js';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-theme-bg text-theme-text flex flex-col justify-between p-6 sm:p-12 font-body transition-colors duration-150 motion-reduce:transition-none">
      <header className="flex items-center justify-between max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <SampleDataTag />
        </div>
        <ThemeToggle />
      </header>

      <main className="max-w-3xl mx-auto w-full text-center py-20 flex flex-col items-center gap-6">
        <h1 className="font-heading font-bold text-5xl sm:text-7xl text-theme-text tracking-tight">
          Ripple AI
        </h1>
        <p className="text-sm text-theme-text-muted">
          Static analysis, dependency graph, and evidence-first debugging. Full hero landing coming in Step 9.
        </p>

        <div className="flex items-center gap-4 mt-6">
          <Link to="/app/overview">
            <Button variant="primary">Enter App</Button>
          </Link>
          <Link to="/dev/design-system">
            <Button variant="secondary">Design System Preview</Button>
          </Link>
        </div>
      </main>

      <footer className="text-center text-xs text-theme-text-muted max-w-5xl mx-auto w-full">
        Evidence-first debugging · Phase 1
      </footer>
    </div>
  );
};
