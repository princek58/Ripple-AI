import { useState, useEffect } from 'react';

/**
 * Returns true if the user has requested reduced motion via system preference.
 * Safely guards against missing or partial matchMedia implementations (e.g. in test runners).
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    try {
      const res = window.matchMedia('(prefers-reduced-motion: reduce)');
      return res ? Boolean(res.matches) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    try {
      const mediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (!mediaQueryList) return;

      setPrefersReducedMotion(Boolean(mediaQueryList.matches));

      const listener = (event: MediaQueryListEvent) => {
        setPrefersReducedMotion(Boolean(event.matches));
      };

      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', listener);
        return () => mediaQueryList.removeEventListener('change', listener);
      } else if (typeof (mediaQueryList as any).addListener === 'function') {
        (mediaQueryList as any).addListener(listener);
        return () => (mediaQueryList as any).removeListener(listener);
      }
    } catch {
      // Fallback silently if matchMedia query throws
    }
  }, []);

  return prefersReducedMotion;
}
