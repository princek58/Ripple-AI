import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/Button.js';

export const CtaBand: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <section
      data-testid="cta-band"
      className={`py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center ${className}`}
    >
      <div className="p-8 sm:p-14 rounded-3xl border border-theme-border/80 bg-theme-surface shadow-md">
        <h2 className="font-heading font-bold text-3xl sm:text-5xl text-theme-text tracking-tight mb-4">
          Understand your project before you deploy.
        </h2>
        <p className="text-base sm:text-lg text-theme-text-muted max-w-2xl mx-auto mb-8 leading-relaxed">
          Upload your project archive to build an evidence-backed dependency graph, uncover hidden
          flaws, and preview deterministic fixes.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/app/projects" className="w-full sm:w-auto">
            <Button
              variant="primary"
              size="lg"
              className="w-full sm:w-auto font-heading flex items-center justify-center gap-2"
            >
              <span>Upload a project</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </Link>

          <a href="#how-it-works" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto font-heading"
            >
              See how it works
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
};
