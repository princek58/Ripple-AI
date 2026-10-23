import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button.js';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center p-6 rounded-xl border border-severity-critical/30 bg-theme-surface text-theme-text ${className}`}
    >
      <div className="w-10 h-10 mb-3 rounded-full bg-severity-critical/10 flex items-center justify-center text-severity-critical">
        <AlertTriangle className="w-5 h-5" aria-hidden="true" />
      </div>
      <h3 className="font-heading font-semibold text-base text-theme-text">{title}</h3>
      <p className="mt-1 text-sm text-theme-text-muted max-w-md">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
};
