import React, { useState } from 'react';

interface AccessScreenProps {
  onSubmit: (code: string) => Promise<{ success: boolean; error?: string }>;
}

export const AccessScreen: React.FC<AccessScreenProps> = ({ onSubmit }) => {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await onSubmit(trimmed);
      if (!result.success) {
        setErrorMessage(result.error || 'Access denied');
      }
    } catch {
      setErrorMessage('Verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="access-gate-screen"
      className="min-h-screen w-full flex items-center justify-center bg-theme-bg p-4 font-body"
    >
      <div className="w-full max-w-sm p-6 sm:p-8 rounded-2xl bg-theme-surface border border-theme-border shadow-xl space-y-6">
        <div className="space-y-1.5 text-center">
          <h1 className="font-heading text-xl font-bold text-theme-text tracking-tight">
            Enter access code
          </h1>
          <p className="text-xs text-theme-text-muted leading-relaxed">
            This Ripple AI deployment is protected. Please enter the access code to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="access-code"
              className="block text-xs font-medium text-theme-text"
            >
              Access code
            </label>
            <input
              id="access-code"
              name="accessCode"
              type="password"
              autoComplete="current-password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isSubmitting}
              placeholder="Enter code"
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-lg bg-theme-surface-active border border-theme-border text-theme-text placeholder:text-theme-text-muted focus:outline-none focus:ring-2 focus:ring-theme-accent focus:border-transparent disabled:opacity-50 transition-all font-body"
            />
          </div>

          {errorMessage && (
            <div
              data-testid="access-gate-error"
              className="p-2.5 rounded-lg bg-severity-critical/10 border border-severity-critical/30 text-xs text-severity-critical font-medium"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !code.trim()}
            className="w-full py-2.5 px-4 rounded-lg bg-forest text-cream hover:opacity-90 font-semibold text-sm transition-opacity focus:outline-none focus:ring-2 focus:ring-theme-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Verifying...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
};
