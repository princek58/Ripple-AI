import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, CheckCircle, AlertTriangle, FileArchive, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { api, getFriendlyErrorMessage } from '../../lib/api.js';
import { formatBytes } from '../../lib/format.js';
import { useProjects } from '../../lib/projectContext.js';
import { Button } from '../../components/ui/Button.js';
import type { Scan } from '../../../../shared/types.js';

// Mirrors the backend default (50 MB); the backend stays authoritative
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export type UploadStep = 'select' | 'review' | 'uploading' | 'scanning' | 'success' | 'error';

export interface UploadFlowProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const UploadFlow: React.FC<UploadFlowProps> = ({
  isOpen,
  onClose,
  triggerRef,
}) => {
  const navigate = useNavigate();
  const { setSelectedProjectId, refresh } = useProjects();

  const [step, setStep] = useState<UploadStep>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<Scan | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when opened or closed
  const resetState = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStep('select');
    setSelectedFile(null);
    setClientError(null);
    setApiError(null);
    setCreatedProjectId(null);
    setScanResult(null);
    setIsDragging(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
    if (triggerRef?.current) {
      triggerRef.current.focus();
    }
  }, [onClose, resetState, triggerRef]);

  // Trap focus & Escape listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Initial focus into modal
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const firstFocusable = modalRef.current.querySelector<HTMLElement>(
          'button, input, [tabindex="0"]'
        );
        firstFocusable?.focus();
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, handleClose]);

  // File validation
  const validateAndSelectFile = (file: File) => {
    setClientError(null);
    setApiError(null);

    // Client-side check 1: extension .zip
    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith('.zip')) {
      setClientError('This is not a valid ZIP file');
      setSelectedFile(null);
      return;
    }

    // Client-side check 2: max 50 MB
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setClientError('File is too large');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setStep('review');
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSelectFile(file);
    }
    // Clear input so same file can be selected again
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSelectFile(file);
    }
  };

  // Perform upload and scan in sequence
  const startUploadAndScan = async () => {
    if (!selectedFile) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setApiError(null);

    try {
      // Step 1: Uploading
      setStep('uploading');
      const project = await api.uploadProject(selectedFile, controller.signal);
      setCreatedProjectId(project.id);

      // Step 2: Scanning
      setStep('scanning');
      const scan = await api.scanProject(project.id, controller.signal);
      setScanResult(scan);

      // Step 3: Success
      setStep('success');
      setSelectedProjectId(project.id);
      await refresh();
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        handleClose();
        return;
      }
      const message = getFriendlyErrorMessage(err);
      setApiError(message);
      setStep('error');
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    handleClose();
  };

  const handleOpenOverview = () => {
    if (createdProjectId) {
      setSelectedProjectId(createdProjectId);
    }
    handleClose();
    navigate('/app/overview');
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-text/40 backdrop-blur-xs"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-2xl border border-theme-border bg-theme-surface shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none text-theme-text"
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 id="upload-dialog-title" className="font-heading font-bold text-xl sm:text-2xl text-theme-text">
              Upload project
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-theme-text-muted">
              Select or drop a ZIP archive of your source code repository.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close upload dialog"
            className="p-1.5 rounded-lg text-theme-text-muted hover:bg-theme-surface-active focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Step: Select File */}
        {step === 'select' && (
          <div className="space-y-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              tabIndex={0}
              role="button"
              aria-label="Choose a ZIP file or drag and drop here"
              className={`flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime ${
                isDragging
                  ? 'border-forest bg-forest/5 dark:border-lime dark:bg-lime/5'
                  : 'border-theme-border bg-theme-bg/60 hover:bg-theme-bg'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-forest/10 dark:bg-lime/10 text-forest dark:text-lime flex items-center justify-center mb-3">
                <Upload className="w-6 h-6" aria-hidden="true" />
              </div>
              <p className="font-heading font-medium text-sm text-theme-text text-center">
                Click to browse or drop your ZIP file here
              </p>
              <p className="mt-1 text-xs text-theme-text-muted text-center">
                Plain archive up to 50 MB. Code is never executed.
              </p>
            </div>

            <input
              ref={fileInputRef}
              id="zip-upload-input"
              type="file"
              accept=".zip,application/zip"
              onChange={handleFileInputChange}
              className="sr-only"
              data-testid="file-upload-input"
            />

            {clientError && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3 rounded-lg border border-severity-critical/30 bg-severity-critical/10 text-severity-critical text-xs"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{clientError}</span>
              </div>
            )}
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && selectedFile && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border border-theme-border bg-theme-bg/60 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-theme-border/60 flex items-center justify-center text-theme-text shrink-0">
                  <FileArchive className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-theme-text truncate">{selectedFile.name}</p>
                  <p className="text-xs text-theme-text-muted">{formatBytes(selectedFile.size)}</p>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-theme-border/70 bg-theme-surface text-xs text-theme-text-muted">
                Code is not executed. Secret values are never read or shown.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" size="md" onClick={() => setStep('select')}>
                Change file
              </Button>
              <Button variant="primary" size="md" onClick={startUploadAndScan}>
                Import and scan
              </Button>
            </div>
          </div>
        )}

        {/* Step: Progress (Uploading or Scanning) */}
        {(step === 'uploading' || step === 'scanning') && (
          <div className="py-8 space-y-6 text-center">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-forest/10 dark:bg-lime/10 text-forest dark:text-lime flex items-center justify-center animate-spin motion-reduce:animate-none">
                <Loader2 className="w-7 h-7" aria-hidden="true" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-heading font-semibold text-lg text-theme-text">
                {step === 'uploading' ? 'Uploading...' : 'Reading files, mapping dependencies...'}
              </h3>
              <p className="text-xs text-theme-text-muted">
                {step === 'uploading'
                  ? 'Transmitting plain ZIP archive to backend storage.'
                  : 'Analyzing code structure, modules, imports, and findings.'}
              </p>
            </div>

            {/* Indeterminate progress bar */}
            <div className="w-full bg-theme-border/50 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-forest dark:bg-lime rounded-full w-2/3 animate-pulse motion-reduce:animate-none" />
            </div>

            <div className="pt-2">
              <Button variant="secondary" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 rounded-xl border border-forest/30 dark:border-lime/30 bg-forest/10 dark:bg-lime/10 text-theme-text">
              <CheckCircle className="w-6 h-6 text-forest dark:text-lime shrink-0" aria-hidden="true" />
              <div>
                <h3 className="font-heading font-semibold text-sm">Scan completed successfully</h3>
                {scanResult?.notes && (
                  <p className="mt-1 text-xs text-theme-text-muted">{scanResult.notes}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" size="md" onClick={handleClose}>
                Close
              </Button>
              <Button variant="primary" size="md" onClick={handleOpenOverview}>
                Open overview
                <ArrowRight className="w-4 h-4 ml-1.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div className="space-y-6">
            <div
              role="alert"
              className="flex items-start gap-3 p-4 rounded-xl border border-severity-critical/30 bg-severity-critical/10 text-theme-text"
            >
              <AlertTriangle className="w-5 h-5 text-severity-critical shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="font-heading font-semibold text-sm text-severity-critical">Upload failed</h3>
                <p className="mt-1 text-xs text-theme-text-muted">{apiError || 'Failed to upload project'}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" size="md" onClick={handleCancel}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={startUploadAndScan}>
                <RefreshCw className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Retry
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
