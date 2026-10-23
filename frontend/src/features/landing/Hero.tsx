import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button.js';
import { HeroGraph } from './HeroGraph.js';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion.js';

export interface HeroProps {
  className?: string;
  forceReducedMotion?: boolean;
}

export const Hero: React.FC<HeroProps> = ({
  className = '',
  forceReducedMotion,
}) => {
  const systemReducedMotion = usePrefersReducedMotion();
  const reducedMotion = forceReducedMotion ?? systemReducedMotion;
  const [parallaxY, setParallaxY] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      setParallaxY(0);
      return;
    }

    const handleScroll = () => {
      setParallaxY(Math.min(window.scrollY * 0.12, 50));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [reducedMotion]);

  return (
    <section
      data-testid="hero-section"
      className={`relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden ${className}`}
    >
      {/* Faint grid background with very light parallax (disabled for reduced motion) */}
      <div
        data-testid="hero-grid-background"
        className="absolute inset-0 pointer-events-none opacity-35 dark:opacity-20 overflow-hidden"
        aria-hidden="true"
        style={!reducedMotion ? { transform: `translateY(${parallaxY}px)` } : undefined}
      >
        <svg className="w-full h-full" width="100%" height="100%">
          <defs>
            <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="var(--theme-border)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>

      <div className="relative max-w-5xl mx-auto flex flex-col items-center text-center">
        {/* Badge: Evidence-first debugging */}
        <div className="mb-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-theme-border bg-theme-surface/80 backdrop-blur-sm text-forest dark:text-lime shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-forest dark:text-lime" aria-hidden="true" />
          <span className="text-xs font-semibold tracking-wide uppercase font-mono">
            Evidence-first debugging
          </span>
        </div>

        {/* Headline with lime underline drawing once under "evidence" */}
        <h1 className="font-heading font-bold text-4xl sm:text-5xl md:text-6xl text-theme-text tracking-tight max-w-4xl leading-tight sm:leading-tight md:leading-tight">
          Understand why it breaks, with{' '}
          <span className="relative inline-block whitespace-nowrap">
            evidence
            {/* SVG lime underline drawn once */}
            <svg
              className="absolute -bottom-2.5 left-0 w-full h-3 overflow-visible pointer-events-none"
              viewBox="0 0 160 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M 2 8 C 45 13, 115 12, 158 5"
                stroke="var(--color-lime)"
                strokeWidth="3.5"
                strokeLinecap="round"
                className={!reducedMotion ? 'animate-underline-draw' : undefined}
                style={
                  reducedMotion
                    ? { strokeDasharray: 'none' }
                    : {
                        strokeDasharray: 180,
                        strokeDashoffset: 0,
                        animation: 'drawUnderline 0.9s ease-out forwards',
                      }
                }
              />
            </svg>
          </span>
        </h1>

        {/* One short supporting sentence (no claims about numbers, users or accuracy) */}
        <p className="mt-6 text-base sm:text-lg text-theme-text-muted max-w-2xl leading-relaxed">
          Static analysis reconstructs your project&apos;s real dependency graph, pinpoints root
          causes, and generates verifiable fix diffs before code executes.
        </p>

        {/* Two CTA buttons: "Upload a project" and "See how it works" */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <Link to="/app/projects" className="w-full sm:w-auto">
            <Button
              variant="primary"
              size="lg"
              className="w-full sm:w-auto font-heading flex items-center justify-center gap-2"
            >
              <span>Upload a project</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </Link>

          <a href="#how-it-works" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto font-heading"
            >
              See how it works
            </Button>
          </a>
        </div>

        {/* Hero Interactive Graph with Floating NodeChips */}
        <div className="mt-14 w-full max-w-2xl">
          <HeroGraph forceReducedMotion={reducedMotion} />
        </div>
      </div>
    </section>
  );
};
