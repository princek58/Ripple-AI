import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useChatSafe } from './ChatProvider.js';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion.js';

// Global flag so the gentle ripple animation runs only once per page load
let hasAnimatedRipple = false;

export const ChatCircle: React.FC = () => {
  const chat = useChatSafe();
  if (!chat) return null;
  const { isOpen, toggleOpen } = chat;
  const location = useLocation();
  const reducedMotion = usePrefersReducedMotion();

  const [shouldAnimate] = useState<boolean>(() => {
    if (hasAnimatedRipple || reducedMotion) return false;
    hasAnimatedRipple = true;
    return true;
  });

  const [isRaised, setIsRaised] = useState<boolean>(() => {
    return (
      location.search.includes('impact=') ||
      typeof document !== 'undefined' && Boolean(document.querySelector('[data-testid="impact-view"]'))
    );
  });

  // Check if Impact view or dialog is open
  useEffect(() => {
    const checkImpact = () => {
      const hasImpactParam = location.search.includes('impact=');
      const hasImpactDom = Boolean(document.querySelector('[data-testid="impact-view"]'));
      setIsRaised(hasImpactParam || hasImpactDom);
    };

    checkImpact();
    const interval = setInterval(checkImpact, 250);
    return () => clearInterval(interval);
  }, [location.search]);

  const accessibleName = isOpen ? 'Close Ripple AI chat' : 'Open Ripple AI chat';

  return (
    <div
      className={`fixed ${
        isRaised ? 'bottom-24' : 'bottom-6'
      } right-6 z-40 transition-all duration-200`}
    >
      {/* Gentle one-time ripple animation rings (completely off under reduced motion) */}
      {shouldAnimate && !reducedMotion && (
        <>
          <span
            className="absolute inset-0 rounded-full bg-[var(--chat-circle-bg)] pointer-events-none animate-chat-ripple-1 opacity-70"
            aria-hidden="true"
          />
          <span
            className="absolute inset-0 rounded-full bg-[var(--chat-circle-bg)] pointer-events-none animate-chat-ripple-2 opacity-50"
            aria-hidden="true"
          />
        </>
      )}

      <button
        id="ripple-chat-circle"
        type="button"
        onClick={toggleOpen}
        aria-label={accessibleName}
        aria-expanded={isOpen}
        aria-controls="ripple-chat-panel"
        data-raised={isRaised ? 'true' : undefined}
        className="relative flex items-center justify-center h-14 w-14 md:w-auto md:px-4 rounded-full bg-[var(--chat-circle-bg)] text-[var(--chat-circle-fg)] shadow-lg hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-circle-ring)] focus-visible:ring-offset-2 transition-all duration-200 select-none group"
      >
        {/* Desktop pill label */}
        <span
          className="hidden md:inline mr-2 text-xs font-semibold tracking-wide whitespace-nowrap"
          data-testid="chat-circle-pill-label"
        >
          Ask Ripple AI
        </span>

        {/* Icon: original speech bubble with 3 concentric arcs or downward chevron when open */}
        <span className="w-6 h-6 flex items-center justify-center flex-shrink-0">
          {isOpen ? (
            <svg
              aria-hidden="true"
              className="w-5 h-5 stroke-current"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              className="w-6 h-6 stroke-current"
              viewBox="0 0 28 28"
              fill="none"
            >
              {/* Speech bubble */}
              <path
                d="M4 8a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-2l-3 2.5V17H7a3 3 0 0 1-3-3V8z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              {/* Three concentric arcs (ripple waves) at upper right */}
              <path
                d="M19 6a3 3 0 0 1 3 3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M19 3.5a5.5 5.5 0 0 1 5.5 5.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M19 1a8 8 0 0 1 8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
      </button>
    </div>
  );
};
