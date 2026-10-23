import React from 'react';
import { NavLink } from 'react-router-dom';

export interface NavItem {
  name: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'Overview', href: '/app/overview' },
  { name: 'Projects', href: '/app/projects' },
  { name: 'Graph', href: '/app/graph' },
  { name: 'Investigations', href: '/app/investigations' },
  { name: 'Fixes', href: '/app/fixes' },
  { name: 'Tests', href: '/app/tests' },
  { name: 'Reports', href: '/app/reports' },
];

export interface TopPillNavProps {
  className?: string;
}

export const TopPillNav: React.FC<TopPillNavProps> = ({ className = '' }) => {
  return (
    <nav
      aria-label="Main navigation"
      className={`flex items-center overflow-x-auto py-1 scrollbar-none gap-1 sm:gap-1.5 ${className}`}
    >
      <div className="flex items-center gap-1 sm:gap-1.5 p-1 rounded-full bg-theme-surface border border-theme-border shadow-xs">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) => {
              const base =
                'relative px-3 py-1.5 text-xs sm:text-sm rounded-full transition-all duration-150 motion-reduce:transition-none flex items-center gap-1.5 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime';
              const activeStyle = isActive
                ? 'font-bold bg-theme-nav-active-bg text-theme-nav-active-text border border-theme-border shadow-xs'
                : 'font-normal text-theme-text-muted hover:text-theme-text hover:bg-theme-surface-active';
              return `${base} ${activeStyle}`;
            }}
          >
            {({ isActive }) => (
              <>
                {/* Active indicator dot ensures active state is not conveyed by color alone */}
                {isActive && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-theme-nav-active-text"
                    aria-hidden="true"
                  />
                )}
                <span>{item.name}</span>
                {isActive && <span className="sr-only">(current page)</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
