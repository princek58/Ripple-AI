import React from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  SampleDataTag,
  EmptyState,
  ErrorState,
  Skeleton,
  KpiTile,
  SeverityBadge,
  ConfidenceBadge,
  VerificationBadge,
} from '../components/ui/index.js';
import { TopPillNav } from '../components/layout/TopPillNav.js';
import { ProjectSwitcher } from '../components/layout/ProjectSwitcher.js';
import { ThemeToggle, useTheme } from '../lib/theme.js';
import { Activity, ShieldAlert, Cpu, Sparkles, FolderUp } from 'lucide-react';

export const DesignSystemPage: React.FC = () => {
  const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text font-body p-6 sm:p-10 transition-colors duration-150 motion-reduce:transition-none">
      {/* Top Bar */}
      <header className="max-w-6xl mx-auto flex items-center justify-between pb-8 border-b border-theme-border">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading font-bold text-3xl sm:text-4xl text-theme-text">
              Design System & Tokens
            </h1>
            <SampleDataTag />
          </div>
          <p className="mt-1 text-sm text-theme-text-muted">
            Interactive preview of Ripple AI components, states, tokens, and themes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/app/overview">
            <Button variant="secondary" size="sm">Go to App</Button>
          </Link>
          <div className="flex items-center gap-2 bg-theme-surface p-1.5 rounded-lg border border-theme-border">
            <span className="text-xs font-medium text-theme-text-muted capitalize">
              Theme: {theme}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-8 space-y-12">
        {/* SECTION 1: Brand & Theme Tokens */}
        <section aria-labelledby="tokens-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="tokens-heading" className="font-heading font-semibold text-xl text-theme-text">
              1. Theme & Brand Tokens
            </h2>
            <SampleDataTag size="sm" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Core Color Tokens</CardTitle>
              <CardDescription>UI brand and semantic tokens loaded from tokens.css</CardDescription>
            </CardHeader>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface">
                <div className="w-full h-8 rounded bg-forest mb-2" />
                <span className="text-xs font-semibold block">forest</span>
                <span className="text-[10px] text-theme-text-muted">--color-forest</span>
              </div>
              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface">
                <div className="w-full h-8 rounded bg-lime border border-theme-border mb-2" />
                <span className="text-xs font-semibold block">lime</span>
                <span className="text-[10px] text-theme-text-muted">--color-lime</span>
              </div>
              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface">
                <div className="w-full h-8 rounded bg-cream border border-theme-border mb-2" />
                <span className="text-xs font-semibold block">cream</span>
                <span className="text-[10px] text-theme-text-muted">--color-cream</span>
              </div>
              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface">
                <div className="w-full h-8 rounded bg-slate-green mb-2" />
                <span className="text-xs font-semibold block">slate-green</span>
                <span className="text-[10px] text-theme-text-muted">--color-slate-green</span>
              </div>
              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface">
                <div className="w-full h-8 rounded bg-near-black-green mb-2" />
                <span className="text-xs font-semibold block">near-black-green</span>
                <span className="text-[10px] text-theme-text-muted">--color-near-black-green</span>
              </div>
              <div className="p-3 rounded-lg border border-theme-border bg-theme-surface">
                <div className="w-full h-8 rounded bg-theme-bg border border-theme-border mb-2" />
                <span className="text-xs font-semibold block">theme-bg</span>
                <span className="text-[10px] text-theme-text-muted">--theme-bg</span>
              </div>
            </div>
          </Card>
        </section>

        {/* SECTION 2: Buttons */}
        <section aria-labelledby="buttons-heading" className="space-y-4">
          <h2 id="buttons-heading" className="font-heading font-semibold text-xl text-theme-text">
            2. Buttons
          </h2>
          <Card className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase mb-3">Variants</h4>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">Primary Button</Button>
                <Button variant="secondary">Secondary Button</Button>
                <Button variant="outline">Outline Button</Button>
                <Button variant="ghost">Ghost Button</Button>
                <Button variant="danger">Danger Button</Button>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase mb-3">Sizes</h4>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small (sm)</Button>
                <Button size="md">Medium (md)</Button>
                <Button size="lg">Large (lg)</Button>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase mb-3">Disabled State</h4>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" disabled>Disabled Primary</Button>
                <Button variant="secondary" disabled>Disabled Secondary</Button>
                <Button variant="outline" disabled>Disabled Outline</Button>
              </div>
            </div>
          </Card>
        </section>

        {/* SECTION 3: Badges & Tags */}
        <section aria-labelledby="badges-heading" className="space-y-4">
          <h2 id="badges-heading" className="font-heading font-semibold text-xl text-theme-text">
            3. Badges & Tags
          </h2>
          <Card className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase mb-3">Generic Badges</h4>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">Default</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="forest">Forest</Badge>
                <Badge variant="lime">Lime</Badge>
                <Badge variant="muted">Muted</Badge>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase mb-3">Sample Data Tag</h4>
              <div className="flex items-center gap-3">
                <SampleDataTag size="sm" />
                <SampleDataTag size="md" />
              </div>
            </div>
          </Card>
        </section>

        {/* SECTION 4: Status Badges (Severity, Confidence, Verification) */}
        <section aria-labelledby="status-heading" className="space-y-4">
          <h2 id="status-heading" className="font-heading font-semibold text-xl text-theme-text">
            4. Status Badges (Icon + Label, Never Colour Alone)
          </h2>
          <Card className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase mb-3">
                Severity Badges (critical, high, medium, low, unknown)
              </h4>
              <div className="flex flex-wrap items-center gap-3">
                <SeverityBadge severity="critical" />
                <SeverityBadge severity="high" />
                <SeverityBadge severity="medium" />
                <SeverityBadge severity="low" />
                <SeverityBadge severity="unknown" />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <SeverityBadge severity="critical" size="sm" />
                <SeverityBadge severity="high" size="sm" />
                <SeverityBadge severity="medium" size="sm" />
                <SeverityBadge severity="low" size="sm" />
                <SeverityBadge severity="unknown" size="sm" />
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase mb-3">
                Confidence Badges (confirmed, likely, hypothesis)
              </h4>
              <div className="flex flex-wrap items-center gap-3">
                <ConfidenceBadge confidence="confirmed" />
                <ConfidenceBadge confidence="likely" />
                <ConfidenceBadge confidence="hypothesis" />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <ConfidenceBadge confidence="confirmed" size="sm" />
                <ConfidenceBadge confidence="likely" size="sm" />
                <ConfidenceBadge confidence="hypothesis" size="sm" />
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase mb-3">
                Verification Badges (not_tested, reproduced, fix_proposed, fix_verified)
              </h4>
              <div className="flex flex-wrap items-center gap-3">
                <VerificationBadge verification="fix_verified" />
                <VerificationBadge verification="fix_proposed" />
                <VerificationBadge verification="reproduced" />
                <VerificationBadge verification="not_tested" />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <VerificationBadge verification="fix_verified" size="sm" />
                <VerificationBadge verification="fix_proposed" size="sm" />
                <VerificationBadge verification="reproduced" size="sm" />
                <VerificationBadge verification="not_tested" size="sm" />
              </div>
            </div>
          </Card>
        </section>

        {/* SECTION 5: KPI Tiles */}
        <section aria-labelledby="kpi-heading" className="space-y-4">
          <h2 id="kpi-heading" className="font-heading font-semibold text-xl text-theme-text">
            5. KPI Tiles
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile
              label="Open Findings"
              value={24}
              helperText="Requires investigation"
              icon={<ShieldAlert className="w-4 h-4" aria-hidden="true" />}
              badge={<SeverityBadge severity="critical" size="sm" />}
            />
            <KpiTile
              label="Critical + High"
              value={7}
              helperText="High risk issues"
              icon={<Activity className="w-4 h-4" aria-hidden="true" />}
              badge={<SeverityBadge severity="high" size="sm" />}
            />
            <KpiTile
              label="Fixes Pending"
              value={3}
              helperText="Awaiting patch approval"
              icon={<Cpu className="w-4 h-4" aria-hidden="true" />}
              badge={<VerificationBadge verification="fix_proposed" size="sm" />}
            />
            <KpiTile
              label="Verified Fixes"
              value={5}
              helperText="Confirmed with tests"
              icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}
              badge={<VerificationBadge verification="fix_verified" size="sm" />}
            />
          </div>
        </section>

        {/* SECTION 6: Empty, Error & Loading States */}
        <section aria-labelledby="states-heading" className="space-y-4">
          <h2 id="states-heading" className="font-heading font-semibold text-xl text-theme-text">
            6. Empty, Error, and Loading States
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <EmptyState
              title="Upload your first project"
              description="Drop a ZIP file or upload a codebase to map its dependency graph."
              action={<Button size="sm"><FolderUp className="w-3.5 h-3.5 mr-1.5" /> Upload ZIP</Button>}
            />
            <ErrorState
              title="Backend Unavailable"
              message="Could not reach the Ripple AI backend at http://localhost:4000."
              onRetry={() => alert('Retry triggered')}
            />
            <Card className="space-y-3">
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase">Skeleton Placeholders</h4>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-8 w-1/3 rounded-lg" />
            </Card>
          </div>
        </section>

        {/* SECTION 7: Navigation & Project Switcher */}
        <section aria-labelledby="nav-heading" className="space-y-4">
          <h2 id="nav-heading" className="font-heading font-semibold text-xl text-theme-text">
            7. Navigation & Switcher
          </h2>
          <Card className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase mb-3">TopPillNav</h4>
              <TopPillNav />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-theme-text-muted uppercase mb-3">Project Switcher</h4>
              <div className="flex items-center gap-4">
                <ProjectSwitcher />
              </div>
            </div>
          </Card>
        </section>
      </main>
    </div>
  );
};
