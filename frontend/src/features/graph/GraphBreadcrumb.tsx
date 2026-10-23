import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Project, NodeType } from '../../../../shared/types.js';
import { buildBreadcrumb } from './graphTransform.js';

export interface GraphBreadcrumbProps {
  project: Project | { name: string } | null;
  parentModule: { id: string; label: string; path?: string } | null;
  currentNode: { id: string; label: string; type: NodeType } | null;
  currentLevel: number;
  className?: string;
}

export const GraphBreadcrumb: React.FC<GraphBreadcrumbProps> = ({
  project,
  parentModule,
  currentNode,
  currentLevel,
  className = '',
}) => {
  const crumbs = buildBreadcrumb(project, parentModule, currentNode, currentLevel);

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center text-xs text-theme-text-muted ${className}`}
    >
      <ol className="flex items-center gap-1.5 flex-wrap">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={crumb.url + index} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  className="w-3.5 h-3.5 text-theme-text-muted/60 flex-shrink-0"
                  aria-hidden="true"
                />
              )}
              {crumb.isCurrent || isLast ? (
                <span
                  aria-current="page"
                  className="font-semibold text-theme-text truncate max-w-[200px]"
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.url}
                  className="hover:text-theme-primary transition-colors truncate max-w-[150px]"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
