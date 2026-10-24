import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, X, ShieldAlert, FileCode, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { ConfidenceBadge } from '../../components/ui/ConfidenceBadge.js';
import { VerificationBadge } from '../../components/ui/VerificationBadge.js';
import { Button } from '../../components/ui/Button.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { DiffViewer } from './DiffViewer.js';
import { statusLabel } from './fixesPure.js';
import { api } from '../../lib/api.js';
import type { Fix, ProjectFixItem } from './fixesTypes.js';
import type { FindingDetailData, FindingSeverity, FindingConfidence, FindingVerification } from '../../../../shared/types.js';

export interface FixDetailProps {
  fix: Fix | ProjectFixItem;
  onBack?: () => void;
  onRefresh: () => Promise<void> | void;
}

export const FixDetail: React.FC<FixDetailProps> = ({
  fix,
  onBack,
  onRefresh,
}) => {
  const [finding, setFinding] = useState<FindingDetailData | null>(null);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const approveButtonRef = useRef<HTMLButtonElement | null>(null);
  const rejectButtonRef = useRef<HTMLButtonElement | null>(null);

  // Load finding details for badges & title
  useEffect(() => {
    let isCancelled = false;
    const controller = new AbortController();

    setFeedbackMessage(null);
    setErrorMessage(null);

    if (fix.finding_id) {
      api.getFinding(fix.finding_id, controller.signal)
        .then((res) => {
          if (!isCancelled && res) {
            setFinding(res);
          }
        })
        .catch(() => {
          // Fallback gracefully without throwing
        });
    }

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [fix.id, fix.finding_id]);

  const findingTitle =
    finding?.title ||
    ('finding_title' in fix && fix.finding_title) ||
    'Suggested change';

  const severity: FindingSeverity =
    finding?.severity ||
    ('finding_severity' in fix && (fix.finding_severity as FindingSeverity)) ||
    'unknown';

  const confidence: FindingConfidence = finding?.confidence || 'likely';
  const verification: FindingVerification = finding?.verification || (fix.status === 'proposed' ? 'fix_proposed' : 'not_tested');

  const statusInfo = statusLabel(fix.status);
  const isProposed = fix.status === 'proposed';

  // Handle Approve Confirmation
  const handleConfirmApprove = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setFeedbackMessage(null);

    try {
      const res = await api.approveFix(fix.id);
      const patchPath = res.patch_path || fix.patch_path || '';
      setFeedbackMessage(
        `Approved. A patch file was saved on the server (${patchPath}). You can also download it above. Nothing was applied or tested, so the finding stays at its current verification.`
      );
      await onRefresh();
    } catch (err: unknown) {
      if ((err as any)?.status === 409 || (err as any)?.code === 'FIX_ALREADY_RESOLVED') {
        setErrorMessage('This fix was already approved or rejected');
        await onRefresh();
      } else {
        setErrorMessage('Failed to approve fix');
      }
    } finally {
      setIsSubmitting(false);
      setIsApproveOpen(false);
    }
  };

  // Handle Reject Confirmation
  const handleConfirmReject = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setFeedbackMessage(null);

    try {
      await api.rejectFix(fix.id);
      setFeedbackMessage('Rejected suggested change.');
      await onRefresh();
    } catch (err: unknown) {
      if ((err as any)?.status === 409 || (err as any)?.code === 'FIX_ALREADY_RESOLVED') {
        setErrorMessage('This fix was already approved or rejected');
        await onRefresh();
      } else {
        setErrorMessage('Failed to reject fix');
      }
    } finally {
      setIsSubmitting(false);
      setIsRejectOpen(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-theme-surface border border-theme-border rounded-xl overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Phone Back Button */}
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

      {/* Header: Finding Title + Badges linking to Investigations */}
      <div className="space-y-3 pb-4 border-b border-theme-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to={`/app/investigations?finding=${encodeURIComponent(fix.finding_id)}`}
            className="group inline-flex items-center space-x-2 text-theme-text hover:text-theme-primary transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary rounded"
            aria-label={`View finding ${findingTitle} in Investigations`}
          >
            <h1 className="font-heading font-bold text-lg sm:text-xl text-theme-text group-hover:text-theme-primary">
              {findingTitle}
            </h1>
            <ExternalLink className="w-4 h-4 opacity-50 group-hover:opacity-100 shrink-0" aria-hidden="true" />
          </Link>
        </div>

        {/* 3 Separate Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={severity} size="md" />
          <ConfidenceBadge confidence={confidence} size="md" />
          <VerificationBadge verification={verification} size="md" />
        </div>
      </div>

      {/* Permanent Safety Banner */}
      <div
        role="region"
        aria-label="Safety notice"
        data-testid="safety-banner"
        className="flex items-center space-x-3 p-3.5 rounded-lg bg-severity-medium/10 border border-severity-medium/30 text-theme-text"
      >
        <ShieldAlert className="w-5 h-5 text-severity-medium shrink-0" aria-hidden="true" />
        <span className="text-xs sm:text-sm font-semibold">
          Suggested change, not applied, not tested
        </span>
      </div>

      {/* Status Info Card */}
      <div className="p-3.5 rounded-lg bg-theme-bg border border-theme-border space-y-1">
        <div className="text-xs font-semibold text-theme-text">{statusInfo.label}</div>
        <div className="text-xs text-theme-text-muted">{statusInfo.description}</div>
        {fix.status === 'approved' && (
          <div className="text-xs text-theme-text-muted font-mono" data-testid="fix-patch-path">
            Patch: {fix.patch_path || 'Patch saved on server'}
          </div>
        )}
      </div>

      {/* Feedback / Error Alerts */}
      {feedbackMessage && (
        <div
          role="status"
          data-testid="fix-feedback-message"
          className="flex items-start space-x-2.5 p-3.5 rounded-lg bg-severity-low/10 border border-severity-low/30 text-theme-text text-xs sm:text-sm"
        >
          <CheckCircle2 className="w-4 h-4 text-severity-low shrink-0 mt-0.5" aria-hidden="true" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          data-testid="fix-error-message"
          className="flex items-start space-x-2.5 p-3.5 rounded-lg bg-severity-critical/10 border border-severity-critical/30 text-severity-critical text-xs sm:text-sm"
        >
          <AlertTriangle className="w-4 h-4 text-severity-critical shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Affected Files List */}
      {fix.files && fix.files.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-semibold text-theme-text-muted uppercase tracking-wider">
            Affected Files
          </h2>
          <div className="flex flex-wrap gap-2">
            {fix.files.map((file, idx) => (
              <span
                key={idx}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-theme-bg border border-theme-border font-mono text-xs text-theme-text"
              >
                <FileCode className="w-3.5 h-3.5 text-theme-text-muted" aria-hidden="true" />
                <span>{file}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Diff Viewer Component */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-theme-text-muted uppercase tracking-wider">
          Proposed Diff
        </h2>
        <DiffViewer
          diffText={fix.diff_text}
          files={fix.files}
          fixId={fix.id}
          ruleId={finding?.rule_id}
        />
      </div>

      {/* Action Buttons: Only shown when status is proposed */}
      {isProposed && (
        <div className="pt-4 border-t border-theme-border flex flex-wrap items-center gap-3">
          <Button
            ref={approveButtonRef}
            variant="primary"
            size="md"
            onClick={() => setIsApproveOpen(true)}
            disabled={isSubmitting}
            className="gap-1.5"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>Approve change</span>
          </Button>

          <Button
            ref={rejectButtonRef}
            variant="secondary"
            size="md"
            onClick={() => setIsRejectOpen(true)}
            disabled={isSubmitting}
            className="gap-1.5 text-severity-high hover:text-severity-high"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>Reject change</span>
          </Button>
        </div>
      )}

      {/* Accessible Confirm Dialog: Approve */}
      <ConfirmDialog
        role="dialog"
        isOpen={isApproveOpen}
        title="Approve suggested change?"
        description="Approve this suggested change? Your uploaded project is NOT changed. Ripple AI only saves a patch file for you to review and apply yourself."
        confirmLabel="Approve"
        cancelLabel="Cancel"
        confirmVariant="primary"
        isLoading={isSubmitting}
        onConfirm={handleConfirmApprove}
        onCancel={() => setIsApproveOpen(false)}
        initialFocusRef={approveButtonRef}
        testId="approve-confirm-dialog"
      />

      {/* Accessible Confirm Dialog: Reject */}
      <ConfirmDialog
        role="dialog"
        isOpen={isRejectOpen}
        title="Reject suggested change?"
        description="Reject this suggested change? You can generate it again from Investigations."
        confirmLabel="Reject"
        cancelLabel="Cancel"
        confirmVariant="danger"
        isLoading={isSubmitting}
        onConfirm={handleConfirmReject}
        onCancel={() => setIsRejectOpen(false)}
        initialFocusRef={rejectButtonRef}
        testId="reject-confirm-dialog"
      />
    </div>
  );
};
