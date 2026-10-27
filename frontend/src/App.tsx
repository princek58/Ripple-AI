import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './lib/theme.js';
import { ProjectProvider } from './lib/projectContext.js';
import { ChatProvider } from './features/chat/ChatProvider.js';
import { AppShell } from './components/layout/AppShell.js';
import { LandingPage } from './pages/LandingPage.js';
import { OverviewPage } from './features/overview/OverviewPage.js';
import { ProjectsPage } from './features/projects/ProjectsPage.js';
import { DesignSystemPage } from './pages/DesignSystemPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { Skeleton } from './components/ui/Skeleton.js';
import { AccessGate } from './features/access/AccessGate.js';

const GraphPage = React.lazy(() => import('./features/graph/GraphPage.js'));
const InvestigationsPage = React.lazy(
  () => import('./features/investigations/InvestigationsPage.js')
);
const FixesPage = React.lazy(() => import('./features/fixes/FixesPage.js'));
const TestsPage = React.lazy(() => import('./features/tests/TestsPage.js'));
const ReportsPage = React.lazy(() => import('./features/reports/ReportsPage.js'));

export function AppRoutes() {
  return (
    <ProjectProvider>
      <ChatProvider>
        <Routes>
        {/* Landing Page */}
        <Route path="/" element={<LandingPage />} />

        {/* App Shell and Section Routes */}
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="/app/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route
            path="graph"
            element={
              <Suspense
                fallback={
                  <div className="p-6 space-y-4" data-testid="graph-lazy-fallback">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-96 w-full rounded-2xl" />
                  </div>
                }
              >
                <GraphPage />
              </Suspense>
            }
          />
          <Route
            path="investigations"
            element={
              <Suspense
                fallback={
                  <div className="p-6 space-y-4" data-testid="investigations-lazy-fallback">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-96 w-full rounded-2xl" />
                  </div>
                }
              >
                <InvestigationsPage />
              </Suspense>
            }
          />
          <Route
            path="fixes"
            element={
              <Suspense
                fallback={
                  <div className="p-6 space-y-4" data-testid="fixes-lazy-fallback">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-96 w-full rounded-2xl" />
                  </div>
                }
              >
                <FixesPage />
              </Suspense>
            }
          />
          <Route
            path="tests"
            element={
              <Suspense
                fallback={
                  <div className="p-6 space-y-4" data-testid="tests-lazy-fallback">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-96 w-full rounded-2xl" />
                  </div>
                }
              >
                <TestsPage />
              </Suspense>
            }
          />
          <Route
            path="reports"
            element={
              <Suspense
                fallback={
                  <div className="p-6 space-y-4" data-testid="reports-lazy-fallback">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-96 w-full rounded-2xl" />
                  </div>
                }
              >
                <ReportsPage />
              </Suspense>
            }
          />
        </Route>

        {/* Dev Design System Preview */}
        <Route path="/dev/design-system" element={<DesignSystemPage />} />

        {/* 404 Not Found */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ChatProvider>
  </ProjectProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AccessGate>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AccessGate>
    </ThemeProvider>
  );
}

