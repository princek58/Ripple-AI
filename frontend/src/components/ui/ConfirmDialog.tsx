import React, { useEffect, useRef } from 'react';
import { Button } from './Button.js';

export interface ConfirmDialogProps {
  role?: 'dialog' | 'alertdialog';
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  cancelText?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  icon?: React.ReactNode;
  triggerRef?: React.RefObject<HTMLElement | null>;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  cancelTestId?: string;
  confirmTestId?: string;
  testId?: string;
  dialogTitleId?: string;
  dialogDescId?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  role = 'alertdialog',
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  description,
  confirmText,
  confirmLabel,
  confirmVariant = 'primary',
  cancelText,
  cancelLabel,
  isLoading = false,
  icon,
  triggerRef,
  initialFocusRef,
  cancelTestId,
  confirmTestId,
  testId,
  dialogTitleId = 'confirm-dialog-title',
  dialogDescId = 'confirm-dialog-desc',
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const closeFn = onClose || onCancel || (() => {});
  const effectiveConfirmText = confirmText || confirmLabel || 'Confirm';
  const effectiveCancelText = cancelText || cancelLabel || 'Cancel';
  const effectiveTriggerRef = triggerRef || initialFocusRef;
  const effectiveConfirmTestId = confirmTestId || (testId ? `${testId}-confirm` : 'confirm-dialog-confirm');
  const effectiveCancelTestId = cancelTestId || (testId ? `${testId}-cancel` : 'confirm-dialog-cancel');

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFn();
        if (effectiveTriggerRef?.current) {
          effectiveTriggerRef.current.focus();
        }
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Initial focus on the cancel button for safety
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const cancelBtn = dialogRef.current.querySelector<HTMLElement>(
          `[data-testid="${effectiveCancelTestId}"]`
        );
        cancelBtn?.focus();
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, closeFn, effectiveTriggerRef, effectiveCancelTestId]);

  const handleClose = () => {
    closeFn();
    if (effectiveTriggerRef?.current) {
      effectiveTriggerRef.current.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role={role}
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      aria-describedby={dialogDescId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-text/40 backdrop-blur-xs"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl border border-theme-border bg-theme-surface shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none text-theme-text"
      >
        <div className="flex items-start gap-3">
          {icon && <div className="shrink-0">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h3 id={dialogTitleId} className="font-heading font-bold text-lg text-theme-text">
              {title}
            </h3>
            <div id={dialogDescId} className="mt-1 text-xs sm:text-sm text-theme-text-muted leading-relaxed">
              {description}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            size="sm"
            data-testid={effectiveCancelTestId}
            disabled={isLoading}
            onClick={handleClose}
          >
            {effectiveCancelText}
          </Button>
          <Button
            variant={confirmVariant}
            size="sm"
            data-testid={effectiveConfirmTestId}
            disabled={isLoading}
            onClick={onConfirm}
          >
            {isLoading ? 'Processing...' : effectiveConfirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};
