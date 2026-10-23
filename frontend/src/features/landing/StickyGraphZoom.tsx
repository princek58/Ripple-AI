import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card.js';
import { SampleDataTag } from '../../components/ui/SampleDataTag.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { ConfidenceBadge } from '../../components/ui/ConfidenceBadge.js';
import { VerificationBadge } from '../../components/ui/VerificationBadge.js';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion.js';

export interface StageData {
  id: string;
  label: string;
  title: string;
  caption: string;
  level: string;
}

const STAGES: StageData[] = [
  {
    id: 'l1',
    level: 'L1',
    label: 'L1 Project',
    title: 'High-Level System & Service Scope',
    caption: 'Top-level architecture view isolating project roots, modules, and cross-boundary dependencies.',
  },
  {
    id: 'l2',
    level: 'L2',
    label: 'L2 Module',
    title: 'Module Internals & Boundary Contracts',
    caption: 'Expands modules into frontend components, API routers, database queries, and configuration files.',
  },
  {
    id: 'l3',
    level: 'L3',
    label: 'L3 Code',
    title: 'Call Graphs, Functions & Imports',
    caption: 'Maps exact caller-callee chains, function declarations, exports, and relative file specifiers.',
  },
  {
    id: 'l4',
    level: 'L4',
    label: 'L4 Evidence',
    title: 'AST Proof, Line Traces & Findings',
    caption: 'Isolates the exact line span and AST token creating the failure, with full verification criteria.',
  },
];

export interface StickyGraphZoomProps {
  className?: string;
  forceStatic?: boolean;
}

export const StickyGraphZoom: React.FC<StickyGraphZoomProps> = ({
  className = '',
  forceStatic = false,
}) => {
  const systemReducedMotion = usePrefersReducedMotion();
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check narrow screen breakpoint (below md / 768px)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkNarrow = () => {
      setIsNarrowScreen(window.innerWidth < 768);
    };

    checkNarrow();
    window.addEventListener('resize', checkNarrow);
    return () => window.removeEventListener('resize', checkNarrow);
  }, []);

  const shouldUseStatic = forceStatic || systemReducedMotion || isNarrowScreen;

  // Desktop sticky scroll listener
  useEffect(() => {
    if (shouldUseStatic) return;

    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollableHeight = rect.height - window.innerHeight;
      if (scrollableHeight <= 0) return;

      const progress = Math.min(Math.max(-rect.top / scrollableHeight, 0), 1);
      const stageIndex = Math.min(Math.floor(progress * STAGES.length), STAGES.length - 1);
      setActiveStage(stageIndex);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [shouldUseStatic]);

  // Render SVG Diagram for each Stage
  const renderStageSvg = (index: number) => {
    switch (index) {
      case 0:
        // Stage 1: L1 Project
        return (
          <svg className="w-full h-64 sm:h-72" viewBox="0 0 500 240" fill="none" aria-hidden="true">
            {/* Edges */}
            <line x1="250" y1="120" x2="110" y2="70" stroke="var(--theme-border)" strokeWidth="2" />
            <line x1="250" y1="120" x2="390" y2="70" stroke="var(--theme-border)" strokeWidth="2" />
            <line x1="250" y1="120" x2="250" y2="200" stroke="var(--theme-border)" strokeWidth="2" strokeDasharray="4 4" />

            {/* Central Project Node (Module/Project Blue) */}
            <rect x="200" y="95" width="100" height="50" rx="8" stroke="var(--node-project)" strokeWidth="2" fill="var(--node-project)" fillOpacity="0.15" />
            <text x="250" y="125" textAnchor="middle" fill="var(--theme-text)" fontSize="12" fontWeight="600" fontFamily="var(--font-space-grotesk)">
              Project Root
            </text>

            {/* Module 1: Frontend */}
            <rect x="50" y="50" width="90" height="40" rx="6" stroke="var(--node-frontend)" strokeWidth="2" fill="var(--node-frontend)" fillOpacity="0.15" />
            <text x="95" y="75" textAnchor="middle" fill="var(--theme-text)" fontSize="11" fontWeight="500">
              web / frontend
            </text>

            {/* Module 2: Backend */}
            <rect x="345" y="50" width="90" height="40" rx="6" stroke="var(--node-backend)" strokeWidth="2" fill="var(--node-backend)" fillOpacity="0.15" />
            <text x="390" y="75" textAnchor="middle" fill="var(--theme-text)" fontSize="11" fontWeight="500">
              server / api
            </text>

            {/* Module 3: Config */}
            <polygon points="250,175 290,200 250,225 210,200" stroke="var(--node-config)" strokeWidth="2" fill="var(--node-config)" fillOpacity="0.15" />
            <text x="250" y="204" textAnchor="middle" fill="var(--theme-text)" fontSize="10" fontWeight="500">
              env config
            </text>
          </svg>
        );

      case 1:
        // Stage 2: L2 Module with shapes: frontend rounded rect, api hexagon, database cylinder, config diamond, test dashed rect
        return (
          <svg className="w-full h-64 sm:h-72" viewBox="0 0 500 240" fill="none" aria-hidden="true">
            {/* Edges */}
            <line x1="120" y1="80" x2="230" y2="80" stroke="var(--theme-border)" strokeWidth="2" />
            <line x1="270" y1="80" x2="380" y2="80" stroke="var(--theme-border)" strokeWidth="2" strokeDasharray="4 4" />
            <line x1="250" y1="105" x2="250" y2="160" stroke="var(--theme-border)" strokeWidth="2" strokeDasharray="2 3" />
            <line x1="120" y1="105" x2="120" y2="160" stroke="var(--theme-border)" strokeWidth="2" strokeDasharray="3 3" />

            {/* Frontend: Rounded Rectangle */}
            <rect x="50" y="60" width="100" height="45" rx="10" stroke="var(--node-frontend)" strokeWidth="2" fill="var(--node-frontend)" fillOpacity="0.15" />
            <text x="100" y="87" textAnchor="middle" fill="var(--theme-text)" fontSize="11" fontWeight="600">
              NoticePage
            </text>

            {/* API: Hexagon */}
            <polygon points="250,55 285,75 285,95 250,115 215,95 215,75" stroke="var(--node-api)" strokeWidth="2" fill="var(--node-api)" fillOpacity="0.15" />
            <text x="250" y="88" textAnchor="middle" fill="var(--theme-text)" fontSize="11" fontWeight="600">
              /api/notice
            </text>

            {/* Database: Cylinder Shape */}
            <g transform="translate(360, 55)">
              <rect x="0" y="10" width="70" height="35" stroke="var(--node-database)" strokeWidth="2" fill="var(--node-database)" fillOpacity="0.15" />
              <ellipse cx="35" cy="45" rx="35" ry="10" stroke="var(--node-database)" strokeWidth="2" fill="var(--node-database)" fillOpacity="0.15" />
              <ellipse cx="35" cy="10" rx="35" ry="10" stroke="var(--node-database)" strokeWidth="2" fill="var(--node-database)" fillOpacity="0.3" />
              <text x="35" y="32" textAnchor="middle" fill="var(--theme-text)" fontSize="11" fontWeight="600">
                DB Storage
              </text>
            </g>

            {/* Config: Diamond */}
            <polygon points="250,155 285,180 250,205 215,180" stroke="var(--node-config)" strokeWidth="2" fill="var(--node-config)" fillOpacity="0.15" />
            <text x="250" y="184" textAnchor="middle" fill="var(--theme-text)" fontSize="10" fontWeight="600">
              JWT Config
            </text>

            {/* Test: Dashed Rectangle */}
            <rect x="50" y="160" width="100" height="40" stroke="var(--node-test)" strokeWidth="2" strokeDasharray="4 4" fill="var(--node-test)" fillOpacity="0.1" />
            <text x="100" y="184" textAnchor="middle" fill="var(--theme-text)" fontSize="10" fontWeight="500">
              notice.test.ts
            </text>
          </svg>
        );

      case 2:
        // Stage 3: L3 Code
        return (
          <svg className="w-full h-64 sm:h-72" viewBox="0 0 500 240" fill="none" aria-hidden="true">
            {/* Caller graph connections */}
            <path d="M 120 70 L 220 70 L 220 120" stroke="var(--theme-border)" strokeWidth="2" fill="none" />
            <path d="M 220 150 L 340 150" stroke="var(--theme-border)" strokeWidth="2" strokeDasharray="4 4" fill="none" />
            <path d="M 220 120 L 220 190 L 120 190" stroke="var(--theme-border)" strokeWidth="2" strokeDasharray="2 3" fill="none" />

            {/* Function 1 */}
            <rect x="40" y="50" width="120" height="40" rx="6" stroke="var(--node-frontend)" strokeWidth="2" fill="var(--node-frontend)" fillOpacity="0.15" />
            <text x="100" y="74" textAnchor="middle" fill="var(--theme-text)" fontSize="10" fontFamily="var(--font-jetbrains-mono)">
              fetchNotices()
            </text>

            {/* Function 2 */}
            <rect x="160" y="115" width="130" height="42" rx="6" stroke="var(--node-api)" strokeWidth="2" fill="var(--node-api)" fillOpacity="0.15" />
            <text x="225" y="140" textAnchor="middle" fill="var(--theme-text)" fontSize="10" fontFamily="var(--font-jetbrains-mono)">
              router.get(&apos;/notices&apos;)
            </text>

            {/* Function 3 */}
            <rect x="330" y="130" width="130" height="40" rx="6" stroke="var(--node-backend)" strokeWidth="2" fill="var(--node-backend)" fillOpacity="0.15" />
            <text x="395" y="154" textAnchor="middle" fill="var(--theme-text)" fontSize="10" fontFamily="var(--font-jetbrains-mono)">
              noticeService.get()
            </text>

            {/* Function 4 */}
            <rect x="40" y="170" width="120" height="40" rx="6" stroke="var(--node-database)" strokeWidth="2" fill="var(--node-database)" fillOpacity="0.15" />
            <text x="100" y="194" textAnchor="middle" fill="var(--theme-text)" fontSize="10" fontFamily="var(--font-jetbrains-mono)">
              db.query()
            </text>
          </svg>
        );

      case 3:
      default:
        // Stage 4: L4 Evidence with problem node and highlighted investigation edge
        return (
          <div className="flex flex-col gap-3 p-3">
            <svg className="w-full h-36" viewBox="0 0 500 120" fill="none" aria-hidden="true">
              {/* Highlighted investigation edge (red/orange) */}
              <line
                x1="120"
                y1="60"
                x2="320"
                y2="60"
                stroke="var(--severity-critical)"
                strokeWidth="3.5"
                strokeDasharray="6 3"
              />
              <circle cx="120" cy="60" r="5" fill="var(--node-api)" />
              <circle cx="320" cy="60" r="7" fill="var(--severity-critical)" />

              {/* Node labels */}
              <text x="120" y="40" textAnchor="middle" fill="var(--theme-text)" fontSize="10" fontFamily="var(--font-jetbrains-mono)">
                noticeRouter.ts:14
              </text>
              <text x="320" y="40" textAnchor="middle" fill="var(--severity-critical)" fontSize="10" fontWeight="600" fontFamily="var(--font-jetbrains-mono)">
                ./services/storage (unresolved)
              </text>
            </svg>

            {/* Problem node detail with SeverityBadge, ConfidenceBadge, and VerificationBadge */}
            <div
              data-testid="l4-problem-node"
              className="rounded-xl border border-severity-critical/40 bg-theme-surface p-4 flex flex-col gap-2.5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity="high" size="sm" />
                <ConfidenceBadge confidence="confirmed" size="sm" />
                <VerificationBadge verification="not_tested" size="sm" />
              </div>

              <div className="text-xs font-heading font-semibold text-theme-text">
                Evidence: Relative specifier does not resolve to any extracted file
              </div>

              <div className="font-code text-[11px] text-theme-text-muted bg-theme-bg p-2 rounded border border-theme-border/60">
                <code>14 | import {"{ getStorage }"} from &apos;./services/storage&apos;;</code>
              </div>
            </div>
          </div>
        );
    }
  };

  // 1. STATIC MODE: Render 4 stacked cards under prefers-reduced-motion OR narrow screens (< 768px)
  if (shouldUseStatic) {
    return (
      <section
        data-testid="sticky-graph-static"
        className={`py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto overflow-hidden ${className}`}
      >
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="flex items-center justify-center gap-2 mb-3">
            <SampleDataTag size="sm" />
          </div>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-theme-text tracking-tight">
            Four Levels of Dependency Intelligence
          </h2>
          <p className="mt-2 text-sm sm:text-base text-theme-text-muted">
            Zoom dynamically from high-level project roots down to exact code line evidence.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {STAGES.map((stage, idx) => (
            <Card
              key={stage.id}
              data-testid={`static-stage-card-${stage.id}`}
              className="border-theme-border/80 bg-theme-surface shadow-xs overflow-hidden"
            >
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-theme-border/40">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-forest text-cream dark:bg-lime dark:text-forest">
                    {stage.label}
                  </span>
                  <CardTitle className="text-base sm:text-lg">{stage.title}</CardTitle>
                </div>
                <span className="text-xs font-mono text-theme-text-muted">
                  Stage {idx + 1} of 4
                </span>
              </CardHeader>

              <CardDescription className="text-xs sm:text-sm my-3">
                {stage.caption}
              </CardDescription>

              <div className="mt-2 rounded-xl border border-theme-border/60 bg-theme-bg/60 p-3 overflow-hidden">
                {renderStageSvg(idx)}
              </div>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  // 2. DESKTOP STICKY SCROLL MODE
  const currentStage = STAGES[activeStage];

  return (
    <section
      ref={containerRef}
      data-testid="sticky-graph-interactive"
      className={`relative min-h-[260vh] max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 overflow-visible ${className}`}
    >
      <div className="sticky top-20 sm:top-24 py-8 z-20">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <SampleDataTag size="sm" />
          </div>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl text-theme-text tracking-tight">
            Four Levels of Dependency Intelligence
          </h2>
          <p className="mt-2 text-sm text-theme-text-muted">
            Scroll smoothly to explore how Ripple AI navigates from architecture to code lines.
          </p>
        </div>

        {/* Stage Selector Tabs */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STAGES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveStage(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                activeStage === idx
                  ? 'bg-forest text-cream dark:bg-lime dark:text-forest shadow-xs'
                  : 'bg-theme-surface text-theme-text-muted border border-theme-border/60 hover:text-theme-text'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Main Sticky Viewer Card */}
        <Card className="border-theme-border/90 bg-theme-surface shadow-lg overflow-hidden max-w-3xl mx-auto">
          <CardHeader className="flex items-center justify-between pb-3 border-b border-theme-border/40">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-forest text-cream dark:bg-lime dark:text-forest">
                {currentStage.label}
              </span>
              <CardTitle className="text-lg">{currentStage.title}</CardTitle>
            </div>
            <span className="text-xs font-mono text-theme-text-muted">
              {activeStage + 1} / 4
            </span>
          </CardHeader>

          <CardDescription className="text-xs sm:text-sm px-1 py-3 text-theme-text-muted">
            {currentStage.caption}
          </CardDescription>

          <div className="mt-2 rounded-xl border border-theme-border/60 bg-theme-bg/60 p-4 min-h-[300px] flex items-center justify-center overflow-hidden">
            {renderStageSvg(activeStage)}
          </div>
        </Card>
      </div>
    </section>
  );
};
