import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectProvider } from '../lib/projectContext.js';
import { ChatProvider, useChat } from '../features/chat/ChatProvider.js';
import { ChatPanel } from '../features/chat/ChatPanel.js';
import { ChatSettings } from '../features/chat/ChatSettings.js';
import type { Project } from '../../../shared/types.js';

const mockProjectScanned: Project = {
  id: 'proj-123',
  name: 'Demo ERP',
  created_at: '2026-10-20T00:00:00Z',
  size_bytes: 1024,
  file_count: 10,
  languages: ['JavaScript', 'TypeScript'],
  last_scan_at: '2026-10-21T00:00:00Z',
};

function ChatOpener() {
  const { setIsOpen } = useChat();
  return (
    <button data-testid="open-chat-btn" onClick={() => setIsOpen(true)}>
      Open Chat
    </button>
  );
}

describe('DEP1 Part 1 - Owner-Open Defaults and Demo Mode UI', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function setupFetch(statusData: any, settingsData: any) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/projects') && !urlStr.includes('/ai-settings')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [mockProjectScanned],
            error: null,
          }),
        };
      }
      if (urlStr.includes('/api/ai/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: statusData, error: null }),
        };
      }
      if (urlStr.includes('/api/projects/proj-123/ai-settings')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: settingsData, error: null }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: null, error: null }),
      };
    });
  }

  it('1. ChatSettings disables code switch with reason when demo_mode is true', async () => {
    setupFetch(
      { configured: true, provider: 'gemini', model: 'gemini-1.5-flash', demo_mode: true },
      { ai_enabled: true, share_code: true, consent_version: '2026-10-v2' }
    );

    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatSettings />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('demo-mode-code-disabled-reason')).toBeInTheDocument();
    });

    expect(screen.getByText('Code sharing is disabled in demo mode.')).toBeInTheDocument();
    const switchEl = screen.getByRole('checkbox', { name: /Allow sending up to 7 code lines/i });
    expect(switchEl).toBeDisabled();
    expect(switchEl).not.toBeChecked();
  });

  it('2. Chat header note shows code lines sent when share_code is true and not demo mode', async () => {
    setupFetch(
      { configured: true, provider: 'gemini', model: 'gemini-1.5-flash', demo_mode: false },
      { ai_enabled: true, share_code: true, consent_version: '2026-10-v2' }
    );

    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatOpener />
            <ChatPanel />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    act(() => {
      screen.getByTestId('open-chat-btn').click();
    });

    await waitFor(() => {
      const note = screen.getByTestId('chat-header-note');
      expect(note).toBeInTheDocument();
      expect(note.textContent).toBe(
        'Code lines are being sent to Google Gemini for better answers (secrets are never sent).'
      );
    });
  });

  it('3. Chat header note shows only rule names when share_code is false', async () => {
    setupFetch(
      { configured: true, provider: 'gemini', model: 'gemini-1.5-flash', demo_mode: false },
      { ai_enabled: true, share_code: false, consent_version: '2026-10-v2' }
    );

    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatOpener />
            <ChatPanel />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    act(() => {
      screen.getByTestId('open-chat-btn').click();
    });

    await waitFor(() => {
      const note = screen.getByTestId('chat-header-note');
      expect(note).toBeInTheDocument();
      expect(note.textContent).toBe(
        'Only rule names, file names and line numbers are sent to Google Gemini.'
      );
    });
  });

  it('4. Chat header note shows only rule names when demo_mode is true even if share_code is true', async () => {
    setupFetch(
      { configured: true, provider: 'gemini', model: 'gemini-1.5-flash', demo_mode: true },
      { ai_enabled: true, share_code: true, consent_version: '2026-10-v2' }
    );

    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatOpener />
            <ChatPanel />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    act(() => {
      screen.getByTestId('open-chat-btn').click();
    });

    await waitFor(() => {
      const note = screen.getByTestId('chat-header-note');
      expect(note).toBeInTheDocument();
      expect(note.textContent).toBe(
        'Only rule names, file names and line numbers are sent to Google Gemini.'
      );
    });
  });
});
