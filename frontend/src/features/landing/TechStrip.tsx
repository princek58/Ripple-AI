import React from 'react';
import {
  Code2,
  Server,
  Layers,
  FileCode2,
  Terminal,
  Database,
  GitBranch,
} from 'lucide-react';

export interface TechItem {
  name: string;
  category: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

const SUPPORTED_TECHS: TechItem[] = [
  { name: 'React', category: 'Frontend', icon: Code2 },
  { name: 'Node.js', category: 'Runtime', icon: Server },
  { name: 'Express', category: 'Backend', icon: Layers },
  { name: 'TypeScript', category: 'Language', icon: FileCode2 },
  { name: 'Python', category: 'Language', icon: Terminal },
  { name: 'MongoDB', category: 'Database', icon: Database },
  { name: 'MySQL', category: 'Database', icon: Database },
  { name: 'GitHub', category: 'Repository', icon: GitBranch },
];

export const TechStrip: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <section
      data-testid="tech-strip"
      className={`py-12 border-y border-theme-border/60 bg-theme-surface/40 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-heading font-semibold text-lg sm:text-xl text-theme-text mb-8">
          Works with the code you already have
        </h2>

        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 max-w-4xl mx-auto">
          {SUPPORTED_TECHS.map((tech) => {
            const Icon = tech.icon;
            return (
              <div
                key={tech.name}
                data-testid={`tech-item-${tech.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                className="flex items-center gap-2.5 px-4 py-2 rounded-xl border border-theme-border/80 bg-theme-surface shadow-xs transition-colors hover:border-forest/40 dark:hover:border-lime/40"
              >
                <Icon className="w-4 h-4 text-theme-text-muted shrink-0" aria-hidden="true" />
                <span className="font-heading font-medium text-sm text-theme-text tracking-tight">
                  {tech.name}
                </span>
                <span className="text-[10px] font-mono uppercase text-theme-text-muted/60 pl-1 border-l border-theme-border/60">
                  {tech.category}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
