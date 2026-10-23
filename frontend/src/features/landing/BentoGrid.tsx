import React from 'react';
import {
  Layers,
  FileCheck2,
  GitPullRequest,
  ShieldCheck,
  CheckCircle2,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card.js';
import { SampleDataTag } from '../../components/ui/SampleDataTag.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { ConfidenceBadge } from '../../components/ui/ConfidenceBadge.js';
import { VerificationBadge } from '../../components/ui/VerificationBadge.js';
import { Button } from '../../components/ui/Button.js';

export const BentoGrid: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <section
      id="features"
      data-testid="bento-grid-section"
      className={`py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto ${className}`}
    >
      <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
        <h2 className="font-heading font-bold text-3xl sm:text-4xl text-theme-text tracking-tight">
          Engineered for evidence, not guesses
        </h2>
        <p className="mt-4 text-base sm:text-lg text-theme-text-muted">
          Four foundational pillars that guarantee verifiable, safe, and transparent code analysis.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        {/* CARD 1: Layered Graph */}
        <Card
          data-testid="bento-card"
          className="flex flex-col justify-between overflow-hidden border-theme-border/80 bg-theme-surface hover:shadow-md transition-shadow"
        >
          <div>
            <CardHeader className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-theme-bg border border-theme-border/60 text-forest dark:text-lime">
                  <Layers className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle>Layered Graph Navigation</CardTitle>
                  <CardDescription className="mt-0.5">
                    Multi-level zoom from architecture to code lines
                  </CardDescription>
                </div>
              </div>
              <SampleDataTag size="sm" />
            </CardHeader>

            <p className="text-sm text-theme-text-muted mb-6">
              Inspect dependencies at four clear levels of abstraction without getting overwhelmed.
            </p>
          </div>

          {/* Mini L1 to L4 illustration */}
          <div
            data-testid="mockup-layered-graph"
            className="rounded-xl border border-theme-border bg-theme-bg p-4 flex flex-col gap-2.5 font-mono text-xs select-none"
          >
            <div className="flex items-center justify-between p-2 rounded-lg bg-theme-surface border border-theme-border/80">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-node-project/15 text-node-project border border-node-project/30">
                  L1
                </span>
                <span className="font-semibold text-theme-text font-body">L1 Project</span>
              </div>
              <span className="text-[11px] text-theme-text-muted">Global system scope</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-theme-surface border border-theme-border/80 ml-3">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-node-frontend/15 text-node-frontend border border-node-frontend/30">
                  L2
                </span>
                <span className="font-semibold text-theme-text font-body">L2 Module</span>
              </div>
              <span className="text-[11px] text-theme-text-muted">Features & routes</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-theme-surface border border-theme-border/80 ml-6">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-node-backend/15 text-node-backend border border-node-backend/30">
                  L3
                </span>
                <span className="font-semibold text-theme-text font-body">L3 Code</span>
              </div>
              <span className="text-[11px] text-theme-text-muted">Functions & calls</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-theme-surface border border-theme-border/80 ml-9">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-severity-critical/15 text-severity-critical border border-severity-critical/30">
                  L4
                </span>
                <span className="font-semibold text-theme-text font-body">L4 Evidence</span>
              </div>
              <span className="text-[11px] text-theme-text-muted">AST nodes & line trace</span>
            </div>
          </div>
        </Card>

        {/* CARD 2: Evidence and confidence report */}
        <Card
          data-testid="bento-card"
          className="flex flex-col justify-between overflow-hidden border-theme-border/80 bg-theme-surface hover:shadow-md transition-shadow"
        >
          <div>
            <CardHeader className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-theme-bg border border-theme-border/60 text-forest dark:text-lime">
                  <FileCheck2 className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle>Evidence & Confidence Report</CardTitle>
                  <CardDescription className="mt-0.5">
                    Separating proved facts from unverified hypotheses
                  </CardDescription>
                </div>
              </div>
              <SampleDataTag size="sm" />
            </CardHeader>

            <p className="text-sm text-theme-text-muted mb-6">
              Every finding separates severity, confidence, and verification into distinct criteria.
            </p>
          </div>

          {/* Sample finding mockup */}
          <div
            data-testid="mockup-evidence-report"
            className="rounded-xl border border-theme-border bg-theme-bg p-4 flex flex-col gap-3 text-xs select-none"
          >
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity="high" size="sm" />
              <ConfidenceBadge confidence="confirmed" size="sm" />
              <VerificationBadge verification="not_tested" size="sm" />
            </div>

            <div className="font-heading font-semibold text-sm text-theme-text">
              Broken relative import specifier in noticeRouter.ts
            </div>

            <div className="font-mono text-[11px] text-theme-text-muted bg-theme-surface p-2 rounded border border-theme-border/60">
              <code>src/routes/noticeRouter.ts:14 -&gt; &apos;./services/storage&apos;</code>
            </div>

            <div className="pt-2 border-t border-theme-border/60 text-theme-text-muted flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-theme-text-muted shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <strong className="text-theme-text">What is not confirmed:</strong> Whether this path executes during runtime in production.
              </span>
            </div>
          </div>
        </Card>

        {/* CARD 3: Fix preview with approval */}
        <Card
          data-testid="bento-card"
          className="flex flex-col justify-between overflow-hidden border-theme-border/80 bg-theme-surface hover:shadow-md transition-shadow"
        >
          <div>
            <CardHeader className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-theme-bg border border-theme-border/60 text-forest dark:text-lime">
                  <GitPullRequest className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle>Fix Preview with Approval</CardTitle>
                  <CardDescription className="mt-0.5">
                    Deterministic diffs with explicit human sign-off
                  </CardDescription>
                </div>
              </div>
              <SampleDataTag size="sm" />
            </CardHeader>

            <p className="text-sm text-theme-text-muted mb-6">
              Inspect suggested diffs before any change. Uploaded files are immutable and untouched.
            </p>
          </div>

          {/* Tiny sample diff mockup */}
          <div
            data-testid="mockup-diff-viewer"
            className="rounded-xl border border-theme-border bg-theme-bg p-4 flex flex-col gap-3 text-xs select-none"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-theme-border/60">
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-theme-text">
                <FileText className="w-3.5 h-3.5 text-theme-text-muted" aria-hidden="true" />
                <span>.env.example</span>
              </div>
              <span className="text-[10px] font-mono text-theme-text-muted">patch preview</span>
            </div>

            {/* Diff content */}
            <pre className="font-code text-[11px] leading-relaxed p-2.5 rounded bg-theme-surface border border-theme-border/60 overflow-x-auto text-theme-text">
              <code>{`@@ -10,3 +10,4 @@
 PORT=4000
 DATABASE_URL=sqlite://data.db
+JWT_SECRET=`}</code>
            </pre>

            <p className="text-[11px] text-theme-text-muted italic">
              Suggested change, not applied, not tested
            </p>

            {/* Static mockup buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" variant="primary" disabled aria-disabled="true" className="opacity-90">
                Approve
              </Button>
              <Button size="sm" variant="secondary" disabled aria-disabled="true" className="opacity-90">
                Reject
              </Button>
            </div>
          </div>
        </Card>

        {/* CARD 4: Safe by default */}
        <Card
          data-testid="bento-card"
          className="flex flex-col justify-between overflow-hidden border-theme-border/80 bg-theme-surface hover:shadow-md transition-shadow"
        >
          <div>
            <CardHeader className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-theme-bg border border-theme-border/60 text-forest dark:text-lime">
                  <ShieldCheck className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle>Safe by Default</CardTitle>
                  <CardDescription className="mt-0.5">
                    Strict privacy and read-only analysis architecture
                  </CardDescription>
                </div>
              </div>
              <SampleDataTag size="sm" />
            </CardHeader>

            <p className="text-sm text-theme-text-muted mb-6">
              Designed from day one to handle proprietary code without execution risks.
            </p>
          </div>

          {/* Safety guarantees list */}
          <div
            data-testid="mockup-safety-list"
            className="rounded-xl border border-theme-border bg-theme-bg p-4 flex flex-col gap-3.5 text-xs select-none"
          >
            <div className="flex items-start gap-2.5">
              <div className="p-1 rounded-md bg-theme-surface border border-theme-border/80 text-forest dark:text-lime mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              </div>
              <div>
                <span className="font-semibold text-theme-text text-sm">read-only by default</span>
                <p className="text-theme-text-muted text-xs mt-0.5">
                  Original uploaded files are never altered. Approving a fix writes a standalone patch file.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="p-1 rounded-md bg-theme-surface border border-theme-border/80 text-forest dark:text-lime mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              </div>
              <div>
                <span className="font-semibold text-theme-text text-sm">uploaded code is never executed</span>
                <p className="text-theme-text-muted text-xs mt-0.5">
                  Phase 1 runs purely static AST analysis. No commands, node instances, or scripts are run.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="p-1 rounded-md bg-theme-surface border border-theme-border/80 text-forest dark:text-lime mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              </div>
              <div>
                <span className="font-semibold text-theme-text text-sm">secret values are never shown</span>
                <p className="text-theme-text-muted text-xs mt-0.5">
                  Findings only report environment variable names and file locations, never token values.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
};
