import React from 'react';
import { Layout, Network, Database } from 'lucide-react';
import { NodeChip } from './NodeChip.js';
import { SampleDataTag } from '../../components/ui/SampleDataTag.js';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion.js';

export interface HeroGraphProps {
  className?: string;
  forceReducedMotion?: boolean;
}

export const HeroGraph: React.FC<HeroGraphProps> = ({
  className = '',
  forceReducedMotion,
}) => {
  const systemReducedMotion = usePrefersReducedMotion();
  const reducedMotion = forceReducedMotion ?? systemReducedMotion;

  return (
    <div
      data-testid="hero-graph"
      className={`relative w-full max-w-xl mx-auto h-[380px] sm:h-[420px] rounded-2xl border border-theme-border/80 bg-theme-surface/60 backdrop-blur-sm p-4 overflow-hidden select-none shadow-lg ${className}`}
    >
      {/* Sample data tag */}
      <div className="absolute top-3 left-3 z-20">
        <SampleDataTag size="sm" />
      </div>

      {/* Background SVG connecting lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--theme-border)" />
            <stop offset="100%" stopColor="var(--severity-critical)" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Line 1: Notice Page to Notice API */}
        <line
          x1="28%"
          y1="25%"
          x2="72%"
          y2="28%"
          stroke="var(--theme-border)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />

        {/* Line 2: Notice API to Storage */}
        <line
          x1="72%"
          y1="34%"
          x2="48%"
          y2="72%"
          stroke="var(--severity-critical)"
          strokeOpacity="0.5"
          strokeWidth="2"
          strokeDasharray={reducedMotion ? undefined : '6 4'}
          className={!reducedMotion ? 'animate-pulse' : undefined}
        />
      </svg>

      {/* Ripple spreading from problem node ("Storage") */}
      {!reducedMotion && (
        <div
          data-testid="ripple-elements-container"
          className="absolute left-1/2 bottom-12 -translate-x-1/2 translate-y-1/2 pointer-events-none z-0"
          aria-hidden="true"
        >
          <span
            data-testid="ripple-ring-1"
            className="absolute -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-severity-critical/30 animate-ping opacity-75 duration-1000"
          />
          <span
            data-testid="ripple-ring-2"
            className="absolute -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border border-severity-critical/20 animate-pulse duration-1000"
          />
        </div>
      )}

      {/* Chips Layout */}
      {/* 1. Notice Page (Frontend) */}
      <div
        className={`absolute top-12 left-4 sm:left-8 z-10 ${
          !reducedMotion ? 'transition-transform duration-700 hover:-translate-y-1' : ''
        }`}
      >
        <NodeChip
          label="Notice Page"
          typeLabel="Frontend · Route"
          icon={Layout}
          cursorLabel="dev"
          reducedMotion={reducedMotion}
        />
      </div>

      {/* 2. Notice API (API) */}
      <div
        className={`absolute top-16 right-4 sm:right-8 z-10 ${
          !reducedMotion ? 'transition-transform duration-700 hover:-translate-y-1' : ''
        }`}
      >
        <NodeChip
          label="Notice API"
          typeLabel="API · Express"
          icon={Network}
          cursorLabel="call"
          reducedMotion={reducedMotion}
        />
      </div>

      {/* 3. Storage (Database - Problem Node) */}
      <div
        className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-10 ${
          !reducedMotion ? 'transition-transform duration-700 hover:-translate-y-1' : ''
        }`}
      >
        {/* Pulse halo on the problem node */}
        {!reducedMotion && (
          <div
            data-testid="storage-pulse"
            className="absolute -inset-1 rounded-2xl bg-severity-critical/20 animate-pulse -z-10"
            aria-hidden="true"
          />
        )}

        <NodeChip
          label="Storage"
          typeLabel="Database · SQLite"
          icon={Database}
          isProblem={true}
          severityLabel="Critical (sample)"
          cursorLabel="fail"
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
};
