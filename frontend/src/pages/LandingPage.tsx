import React from 'react';
import { Navbar, Hero, TechStrip, BentoGrid } from '../features/landing/index.js';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion.js';

export const LandingPage: React.FC = () => {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text font-body transition-colors duration-150 motion-reduce:transition-none selection:bg-lime selection:text-forest">
      {/* Step 9a: Landing page part 1 */}
      <Navbar />
      <main id="main-content" className="relative">
        <Hero forceReducedMotion={reducedMotion} />
        <TechStrip />
        <BentoGrid />
      </main>
    </div>
  );
};
