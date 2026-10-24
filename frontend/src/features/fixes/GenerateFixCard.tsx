import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, AlertTriangle, ExternalLink } from 'lucide-react';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { ConfidenceBadge } from '../../components/ui/ConfidenceBadge.js';
import { VerificationBadge } from '../../components/ui/VerificationBadge.js';
import { Button } from '../../components/ui/Button.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { api, getFriendlyErrorMessage } from '../../lib/api.js';
import type { Fix } from './fixesTypes.js';
import type { FindingDetailData } from '../../../../shared/types.js';

export interface GenerateFixCardProps {
  findingId: string;
  onFixCreated: (fix: Fix) => void;
  onBack?: () => void;
}

export const GenerateFixCard: React.FC<GenerateFixCardProps> = ({
  findingId,
  onFixCreated,
  onBack,
}) => {
  const [finding, setFinding] = useState<FindingDetailData | null>(null);
  const [isLoadingFinding, setIsLoadingFinding] = useState(true);
  const [findingError, setFindingError] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [is422NoFix, setIs422NoFix] = useState(false);

  const loadFinding = () => {
    setIsLoadingFinding(true);
    setFindingError(null);

    api.getFinding(findingId)
      .then((res) => {
        setFinding(res);
      })
      .catch((err) => {
        setFindingError(getFriendlyErrorMessage(err));
      })
      .finally(() => {
        setIsLoadingFinding(false);
      });
  };

  useEffect(() => {
    loadFinding();
  }, [findingId]);

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerateError(null);
    setIs422NoFix(false);

    try {
      const fix = await api.createFixForFinding(findingId);
      onFixCreated(fix);
    } catch (err: unknown) {
      const status = (err as any)?.status;
      const code = (err as any)?.code || (err as any)?.message;
      if (
        status === 422 ||
        code === 'NO_AUTOMATIC_FIX' ||
        (typeof code === 'string' && code.includes('NO_AUTOMATIC_FIX'))
      ) {
        setIs422NoFix(true);
      } else {
        setGenerateError(getFriendlyErrorMessage(err));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoadingFinding) {
    return (
      <div className="h-full bg-theme-surface border border-theme-border rounded-xl p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-10 w-48 mt-6" />
      </div>
    );
  }

  if (findingError) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-theme-surface border border-theme-border rounded-xl text-center space-y-4">
        <div className="w-10 h-10 rounded-full bg-severity-critical/10 flex items-center justify-center text-severity-critical">
          <AlertTriangle className="w-5 h-5" aria-hidden="true" />
        </div>
        <h3 className="font-heading font-semibold text-base text-theme-text">
          Failed to load finding
        </h3>
        <p className="text-xs text-theme-text-muted max-w-sm">{findingError}</p>
        <Button variant="secondary" size="sm" onClick={loadFinding}>
          Retry
        </Button>
      </div>
    );
  }

  if (!finding) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-theme-surface border border-theme-border rounded-xl p-4 sm:p-6 space-y-6">
      {onBack && (
        <div className="lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1.5 -ml-2 text-theme-text-muted hover:text-theme-text"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to suggested changes</span>
          </Button>
        </div>
      )}

      {/* Header: Finding Title + Badges */}
      <div className="space-y-3 pb-4 border-b border-theme-border">
        <h1 className="font-heading font-bold text-lg sm:text-xl text-theme-text">
          {finding.title}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={finding.severity} size="md" />
          <ConfidenceBadge confidence={finding.confidence} size="md" />
          <VerificationBadge verification={finding.verification} size="md" />
        </div>
      </div>

      {/* 422 No Automatic Fix State */}
      {is422NoFix ? (
        <div
          data-testid="no-auto-fix-message"
          role="alert"
          className="p-5 rounded-lg bg-severity-medium/10 border border-severity-medium/30 space-y-3 text-theme-text"
        >
          <div className="flex items-center space-x-2 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4 text-severity-medium shrink-0" aria-hidden="true" />
            <span>Ripple AI cannot build an automatic change for this finding</span>
          </div>
          <p className="text-xs text-theme-text-muted">
            This finding cannot be resolved with an automated code change. You can review manual steps in Investigations.
          </p>
          <div>
            <Link
              to={`/app/investigations?finding=${encodeURIComponent(findingId)}`}
              className="inline-flex items-center space-x-1.5 text-xs font-medium text-theme-primary hover:underline focus:outline-none focus:ring-2 focus:ring-theme-primary rounded"
            >
              <span>View manual steps in Investigations</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : (
        /* Standard Generation State */
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-theme-bg border border-theme-border text-xs text-theme-text-muted space-y-2">
            <p className="font-medium text-theme-text">Generate Suggested Change</p>
            <p>
              Ripple AI will analyze the finding context and propose a patch for you to review. Your source files will not be modified.
            </p>
          </div>

          {generateError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-severity-critical/10 border border-severity-critical/30 text-severity-critical text-xs flex items-center justify-between"
            >
              <span>{generateError}</span>
              <Button variant="secondary" size="sm" onClick={handleGenerate}>
                Retry
              </Button>
            </div>
          )}

          <div>
            <Button
              variant="primary"
              size="md"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="gap-2"
              aria-label="Generate suggested change"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>{isGenerating ? 'Generating change...' : 'Generate suggested change'}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
