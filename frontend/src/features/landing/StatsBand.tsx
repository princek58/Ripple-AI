import React, { useState, useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion.js';

interface StatDefinition {
  id: string;
  targetValue: number | null;
  textValue?: string;
  label: string;
  detail: string;
}

const STATS: StatDefinition[] = [
  {
    id: 'levels',
    targetValue: 4,
    label: 'Graph Levels',
    detail: 'L1 Project, L2 Module, L3 Code, and L4 Evidence depth',
  },
  {
    id: 'checks',
    targetValue: 6,
    label: 'Automated Checks',
    detail: 'Circular deps, broken imports, isolated files, env vars, unmatched APIs, secrets',
  },
  {
    id: 'executed',
    targetValue: 0,
    label: 'Lines of Code Executed',
    detail: 'Purely static AST evaluation; uploaded files are never run',
  },
  {
    id: 'readonly',
    targetValue: null,
    textValue: 'Read-only',
    label: 'By Default',
    detail: 'Uploaded originals remain untouched; fixes write standalone patch copies',
  },
];

export interface StatsBandProps {
  className?: string;
  forceReducedMotion?: boolean;
}

export const StatsBand: React.FC<StatsBandProps> = ({
  className = '',
  forceReducedMotion,
}) => {
  const systemReducedMotion = usePrefersReducedMotion();
  const reducedMotion = forceReducedMotion ?? systemReducedMotion;

  // Track counts
  const [counts, setCounts] = useState<{ [key: string]: number }>({
    levels: reducedMotion ? 4 : 0,
    checks: reducedMotion ? 6 : 0,
    executed: 0,
  });

  const hasAnimatedRef = useRef(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setCounts({ levels: 4, checks: 6, executed: 0 });
      hasAnimatedRef.current = true;
      return;
    }

    if (hasAnimatedRef.current) {
      return;
    }

    // Function to run the one-time count-up
    const startCountUp = () => {
      if (hasAnimatedRef.current) return;
      hasAnimatedRef.current = true;

      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      const duration = 800; // ms
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        setCounts({
          levels: Math.round(progress * 4),
          checks: Math.round(progress * 6),
          executed: 0,
        });

        if (progress < 1) {
          rafIdRef.current = requestAnimationFrame(animate);
        } else {
          setCounts({ levels: 4, checks: 6, executed: 0 });
          rafIdRef.current = null;
        }
      };

      rafIdRef.current = requestAnimationFrame(animate);
    };

    // If IntersectionObserver is available, observe visibility
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined' && elementRef.current) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            startCountUp();
            if (observer) {
              observer.disconnect();
              observer = null;
            }
          }
        },
        { threshold: 0.1 }
      );
      observer.observe(elementRef.current);

      // Fallback: If no intersection event occurs within 1000ms, start count-up
      // so values are never left at a misleading 0
      fallbackTimerRef.current = setTimeout(() => {
        startCountUp();
      }, 1000);
    } else {
      // Fallback for environments without IntersectionObserver (e.g., standard test runners)
      startCountUp();
    }

    return () => {
      if (observer) observer.disconnect();
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [reducedMotion]);

  return (
    <section
      ref={elementRef}
      data-testid="stats-band"
      className={`py-16 sm:py-20 border-y border-theme-border/60 bg-theme-surface/50 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {STATS.map((stat) => {
            const displayValue =
              stat.targetValue !== null
                ? reducedMotion
                  ? String(stat.targetValue)
                  : String(counts[stat.id] ?? stat.targetValue)
                : stat.textValue;

            return (
              <div
                key={stat.id}
                data-testid="stat-item"
                className="flex flex-col items-center sm:items-start text-center sm:text-left p-6 rounded-2xl border border-theme-border/60 bg-theme-surface shadow-xs"
              >
                <div className="font-heading font-bold text-4xl sm:text-5xl text-forest dark:text-lime tracking-tight mb-2">
                  <span data-testid={`stat-value-${stat.id}`}>{displayValue}</span>
                </div>
                <div className="font-heading font-semibold text-base sm:text-lg text-theme-text mb-1">
                  {stat.label}
                </div>
                <p className="text-xs sm:text-sm text-theme-text-muted leading-relaxed">
                  {stat.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
