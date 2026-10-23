import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './lib/theme.js';
import { AppShell } from './components/layout/AppShell.js';
import { LandingPage } from './pages/LandingPage.js';
import {
  OverviewPage,
  ProjectsPage,
  GraphPage,
  InvestigationsPage,
  FixesPage,
  TestsPage,
  ReportsPage,
} from './pages/AppPlaceholders.js';
import { DesignSystemPage } from './pages/DesignSystemPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export function AppRoutes() {
  return (
    <Routes>
      {/* Landing Page */}
      <Route path="/" element={<LandingPage />} />

      {/* App Shell and Section Routes */}
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Navigate to="/app/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="investigations" element={<InvestigationsPage />} />
        <Route path="fixes" element={<FixesPage />} />
        <Route path="tests" element={<TestsPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>

      {/* Dev Design System Preview */}
      <Route path="/dev/design-system" element={<DesignSystemPage />} />

      {/* 404 Not Found */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  );
}
