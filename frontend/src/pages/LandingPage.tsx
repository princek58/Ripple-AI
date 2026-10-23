import React from 'react';
import {
  Navbar,
  Hero,
  TechStrip,
  BentoGrid,
  StickyGraphZoom,
  HowItWorks,
  SafetyStatement,
  StatsBand,
  CtaBand,
  Footer,
} from '../features/landing/index.js';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion.js';

export const LandingPage: React.FC = () => {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text font-body transition-colors duration-150 motion-reduce:transition-none selection:bg-lime selection:text-forest overflow-x-hidden">
      {/* 1. Navbar */}
      <Navbar />

      <main id="main-content" className="relative">
        {/* 2. Hero */}
        <Hero forceReducedMotion={reducedMotion} />

        {/* 3. TechStrip */}
        <TechStrip />

        {/* 4. BentoGrid (id="features") */}
        <BentoGrid />

        {/* 5. StickyGraphZoom */}
        <StickyGraphZoom forceStatic={reducedMotion} />

        {/* 6. HowItWorks (id="how-it-works") */}
        <HowItWorks />

        {/* 7. SafetyStatement (id="safety") */}
        <SafetyStatement />

        {/* 8. StatsBand */}
        <StatsBand forceReducedMotion={reducedMotion} />

        {/* 9. CtaBand */}
        <CtaBand />
      </main>

      {/* 10. Footer */}
      <Footer />
    </div>
  );
};
