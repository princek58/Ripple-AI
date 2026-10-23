import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Search, Bell, Layers } from 'lucide-react';
import { TopPillNav } from './TopPillNav.js';
import { ProjectSwitcher } from './ProjectSwitcher.js';
import { ThemeToggle } from '../../lib/theme.js';

export const AppShell: React.FC = () => {
  return (
    <div className="min-h-screen bg-theme-bg text-theme-text flex flex-col font-body transition-colors duration-150 motion-reduce:transition-none">
      {/* Top Header / App Shell */}
      <header className="sticky top-0 z-40 w-full border-b border-theme-border bg-theme-surface/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Left: Brand Logo & Project Switcher */}
            <div className="flex items-center gap-3 shrink-0">
              <Link
                to="/"
                aria-label="Ripple AI Home"
                className="flex items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime rounded-lg p-1"
              >
                <div className="w-8 h-8 rounded-lg bg-forest text-cream dark:bg-lime dark:text-forest flex items-center justify-center font-bold shadow-xs">
                  <Layers className="w-4 h-4" aria-hidden="true" />
                </div>
                <span className="font-heading font-bold text-lg tracking-tight text-theme-text hidden sm:inline-block">
                  Ripple AI
                </span>
              </Link>

              <div className="h-5 w-px bg-theme-border hidden sm:block" aria-hidden="true" />

              <ProjectSwitcher />
            </div>

            {/* Center: TopPillNav (Responsive scroll strip on smaller screens) */}
            <div className="hidden md:flex items-center justify-center flex-1 max-w-2xl px-2">
              <TopPillNav />
            </div>

            {/* Right: Search UI, Notifications UI, Avatar, ThemeToggle */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Search UI only */}
              <div className="relative hidden xl:block w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-theme-text-muted" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search (UI only)..."
                  readOnly
                  aria-label="Search"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-theme-border bg-theme-surface text-theme-text placeholder:text-theme-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime cursor-pointer"
                />
              </div>

              {/* Notifications UI only */}
              <button
                type="button"
                aria-label="Notifications (UI only)"
                className="p-2 rounded-lg border border-theme-border bg-theme-surface text-theme-text-muted hover:text-theme-text hover:bg-cream dark:hover:bg-slate-green/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime transition-colors duration-150 motion-reduce:transition-none"
              >
                <Bell className="w-4 h-4" aria-hidden="true" />
              </button>

              {/* Theme toggle */}
              <ThemeToggle />

              {/* Initials Avatar Placeholder */}
              <div
                role="img"
                aria-label="User avatar: RA"
                title="Ripple AI User"
                className="w-8 h-8 rounded-full bg-forest text-cream dark:bg-lime dark:text-forest flex items-center justify-center text-xs font-semibold select-none border border-theme-border shadow-xs"
              >
                RA
              </div>
            </div>
          </div>

          {/* Small screens nav strip (horizontal scroll) */}
          <div className="md:hidden pb-3 pt-1 border-t border-theme-border/50">
            <TopPillNav />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
};
