import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button.js';
import { ThemeToggle } from '../lib/theme.js';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-theme-bg text-theme-text flex flex-col justify-between p-6 sm:p-12 font-body transition-colors duration-150 motion-reduce:transition-none">
      <header className="flex items-center justify-end max-w-5xl mx-auto w-full">
        <ThemeToggle />
      </header>

      <main className="max-w-md mx-auto w-full text-center py-16 flex flex-col items-center">
        <div className="font-heading font-bold text-6xl text-forest dark:text-lime mb-4">
          404
        </div>
        <h1 className="font-heading font-semibold text-2xl text-theme-text mb-2">
          Page Not Found
        </h1>
        <p className="text-sm text-theme-text-muted mb-6">
          The requested path does not exist in Ripple AI.
        </p>
        <Link to="/app/overview">
          <Button variant="primary">Return to App</Button>
        </Link>
      </main>

      <footer className="text-center text-xs text-theme-text-muted max-w-5xl mx-auto w-full">
        Ripple AI · Evidence-first debugging
      </footer>
    </div>
  );
};
