import React, { useState } from 'react';
import { useChat } from './ChatProvider.js';
import { useProjects } from '../../lib/projectContext.js';

interface ChatSettingsProps {
  onBack?: () => void;
}

export const ChatSettings: React.FC<ChatSettingsProps> = ({ onBack }) => {
  const { aiStatus, aiSettings, updateSettings } = useChat();
  const { selectedProjectId, selectedProject } = useProjects();

  const [understood, setUnderstood] = useState<boolean>(false);
  const [showConsentFlow, setShowConsentFlow] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasProject = Boolean(selectedProjectId);
  const isScanned = Boolean(selectedProject?.last_scan_at);
  const canEdit = hasProject && isScanned;

  const aiEnabled = aiSettings ? Boolean(aiSettings.ai_enabled) : true;
  const shareCode = aiSettings ? Boolean(aiSettings.share_code) : true;

  const handleToggleAi = async () => {
    setErrorMessage(null);
    if (!aiEnabled) {
      setShowConsentFlow(true);
      return;
    }
    setIsSaving(true);
    try {
      await updateSettings({
        ai_enabled: false,
        share_code: false,
        consent_version: undefined,
      });
      setShowConsentFlow(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmConsent = async () => {
    if (!understood) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateSettings({
        ai_enabled: true,
        share_code: shareCode,
        consent_version: aiSettings?.current_consent_version || '2026-10-v2',
      });
      setShowConsentFlow(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save consent. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleShareCode = async () => {
    if (!aiEnabled) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateSettings({
        ai_enabled: true,
        share_code: !shareCode,
        consent_version: aiSettings?.current_consent_version || '2026-10-v2',
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update code sharing setting.');
    } finally {
      setIsSaving(false);
    }
  };

  // Status badge text
  let statusBadge = 'Offline help only';
  if (!hasProject) {
    statusBadge = 'Offline help only';
  } else if (aiStatus?.configured === false) {
    statusBadge = 'AI not set up';
  } else if (!aiEnabled) {
    statusBadge = 'AI off for this project';
  } else {
    statusBadge = 'AI on';
  }

  return (
    <div className="flex flex-col h-full p-4 overflow-y-auto font-sans" data-testid="chat-settings-section">
      <div className="flex items-center justify-between pb-3 border-b border-theme-border">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="text-xs text-theme-text-muted hover:text-theme-text p-1 rounded hover:bg-theme-surface-active"
              aria-label="Back to chat"
            >
              ← Back
            </button>
          )}
          <h2 className="text-sm font-semibold text-theme-text">Chat settings</h2>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-theme-surface-active text-theme-text font-medium">
          {statusBadge}
        </span>
      </div>

      {!hasProject && (
        <div className="my-3 p-3 rounded-lg bg-theme-surface border border-theme-border text-xs text-theme-text-muted">
          Select a project to configure AI settings.
        </div>
      )}

      {hasProject && !isScanned && (
        <div className="my-3 p-3 rounded-lg bg-theme-surface border border-theme-border text-xs text-theme-text-muted">
          Scan the project first to configure AI settings.
        </div>
      )}

      {errorMessage && (
        <div className="my-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-500">
          {errorMessage}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {/* Switch 1: Turn on AI for this project */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <label
              htmlFor="ai-enable-switch"
              className={`text-xs font-medium cursor-pointer ${
                canEdit ? 'text-theme-text' : 'text-theme-text-muted'
              }`}
            >
              Turn on AI for this project
            </label>
            <p className="text-[11px] text-theme-text-muted">
              Sends prompts and findings context to the configured AI provider.
            </p>
          </div>
          <input
            id="ai-enable-switch"
            type="checkbox"
            checked={aiEnabled}
            disabled={!canEdit || isSaving}
            onChange={handleToggleAi}
            className="w-4 h-4 rounded border-theme-border text-theme-primary focus:ring-theme-primary cursor-pointer disabled:cursor-not-allowed"
          />
        </div>

        {/* Consent Flow for Switch 1 */}
        {showConsentFlow && !aiEnabled && (
          <div
            className="p-3 rounded-lg bg-theme-surface border border-theme-border space-y-3"
            data-testid="consent-container"
          >
            <h3 className="text-xs font-semibold text-theme-text">AI Usage &amp; Consent</h3>
            <div className="text-[11px] text-theme-text-muted max-h-32 overflow-y-auto p-2 bg-theme-surface-active rounded whitespace-pre-wrap">
              {aiSettings?.consent_text ||
                'By turning on AI for this project, prompts and architecture context will be sent to the configured AI provider. Free-tier providers may store data for safety monitoring.'}
            </div>
            <label className="flex items-center gap-2 text-xs text-theme-text cursor-pointer">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-theme-border"
              />
              <span>I understand</span>
            </label>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConsentFlow(false)}
                className="px-2.5 py-1 text-xs text-theme-text-muted hover:text-theme-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!understood || isSaving}
                onClick={handleConfirmConsent}
                className="px-3 py-1 text-xs font-medium bg-theme-primary text-theme-surface rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {/* Switch 2: Allow sending up to 7 code lines */}
        <div className="flex items-start justify-between gap-3 pt-2 border-t border-theme-border">
          <div className="flex-1">
            <label
              htmlFor="ai-share-code-switch"
              className={`text-xs font-medium ${
                canEdit && aiEnabled ? 'text-theme-text cursor-pointer' : 'text-theme-text-muted cursor-not-allowed'
              }`}
            >
              Allow sending up to 7 code lines
            </label>
            <p className="text-[11px] text-theme-text-muted">
              Sends up to 7 lines of code context for more accurate fix advice.
            </p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              Only for code you own or may share
            </p>
          </div>
          <input
            id="ai-share-code-switch"
            type="checkbox"
            checked={shareCode}
            disabled={!canEdit || !aiEnabled || isSaving}
            onChange={handleToggleShareCode}
            className="w-4 h-4 rounded border-theme-border text-theme-primary focus:ring-theme-primary cursor-pointer disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
};
