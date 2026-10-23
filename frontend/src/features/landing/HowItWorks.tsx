import React from 'react';
import {
  UploadCloud,
  Network,
  Search,
  CheckCircle2,
  Code2,
  Webhook,
  Database,
  Sliders,
  FlaskConical,
  GitBranch,
} from 'lucide-react';

interface StepItem {
  number: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

const STEPS: StepItem[] = [
  {
    number: '01',
    title: 'Upload',
    description:
      'Upload a project ZIP; files are read safely with stream extraction, zip-slip protection, and zero code execution.',
    icon: UploadCloud,
  },
  {
    number: '02',
    title: 'Understand',
    description:
      'Static AST parsing reconstructs your project’s true dependency graph across frontend views, backend routes, and database models.',
    icon: Network,
  },
  {
    number: '03',
    title: 'Investigate',
    description:
      'Automated checks uncover broken imports, missing environment variables, circular dependencies, and mismatched endpoints.',
    icon: Search,
  },
  {
    number: '04',
    title: 'Fix and verify',
    description:
      'Review deterministic diff previews and explicitly approve patches; original uploaded source files remain immutable and untouched.',
    icon: CheckCircle2,
  },
];

interface TileItem {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  isComingLater?: boolean;
}

const TILES: TileItem[] = [
  {
    title: 'Frontend',
    description: 'React, Vite, JSX, and TSX component trees and caller sites.',
    icon: Code2,
  },
  {
    title: 'APIs',
    description: 'Express routes matched against client fetch and axios string endpoints.',
    icon: Webhook,
  },
  {
    title: 'Database',
    description: 'SQLite, MongoDB, and MySQL schema imports and query references.',
    icon: Database,
  },
  {
    title: 'Config',
    description: 'Environment variable usage cross-referenced against .env.example templates.',
    icon: Sliders,
  },
  {
    title: 'Tests',
    description: 'Test file associations mapped across code modules without executing scripts.',
    icon: FlaskConical,
  },
  {
    title: 'CI/CD',
    description: 'Automated continuous integration pipeline checks and PR comment bots.',
    icon: GitBranch,
    isComingLater: true,
  },
];

export const HowItWorks: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <section
      id="how-it-works"
      data-testid="how-it-works-section"
      className={`py-20 sm:py-28 bg-slate-green text-cream border-y border-forest/30 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <span className="text-xs font-mono uppercase tracking-widest text-lime mb-3 inline-block">
            Static Analysis Workflow
          </span>
          <h2 className="font-heading font-bold text-3xl sm:text-5xl text-cream tracking-tight">
            How Ripple AI Works
          </h2>
          <p className="mt-4 text-base sm:text-lg text-cream/80 max-w-2xl mx-auto">
            A transparent four-step pipeline designed specifically for evidence-backed debugging
            with absolute safety guarantees.
          </p>
        </div>

        {/* 4 Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                data-testid={`how-it-works-step-${step.title.toLowerCase().replace(/\s+/g, '-')}`}
                className="flex flex-col justify-between p-6 rounded-2xl bg-forest/40 border border-cream/10 backdrop-blur-xs transition-colors hover:border-lime/30"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs font-bold text-lime px-2 py-0.5 rounded bg-lime/10 border border-lime/20">
                      {step.number}
                    </span>
                    <Icon className="w-5 h-5 text-cream/70" aria-hidden="true" />
                  </div>
                  <h3 className="font-heading font-semibold text-xl text-cream mb-2">
                    {step.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-cream/75 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* 6 Technology Scope Tiles */}
        <div className="pt-8 border-t border-cream/10">
          <h3 className="text-center font-heading font-semibold text-lg sm:text-xl text-cream mb-8">
            Coverage Across Your Entire Architecture
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TILES.map((tile) => {
              const Icon = tile.icon;
              return (
                <div
                  key={tile.title}
                  data-testid={`how-it-works-tile-${tile.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  className="flex items-start gap-4 p-5 rounded-xl bg-forest/30 border border-cream/10 relative overflow-hidden"
                >
                  <div className="p-2.5 rounded-lg bg-slate-green border border-cream/15 text-lime shrink-0">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-heading font-semibold text-base text-cream">
                        {tile.title}
                      </span>
                      {tile.isComingLater && (
                        <span
                          data-testid="coming-later-badge"
                          className="font-mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-cream/10 text-lime border border-lime/30"
                        >
                          Coming later
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-cream/70 leading-relaxed">
                      {tile.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
