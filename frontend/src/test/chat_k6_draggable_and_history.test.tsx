import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectProvider } from '../lib/projectContext.js';
import { ChatProvider, useChat } from '../features/chat/ChatProvider.js';
import { ChatPanel } from '../features/chat/ChatPanel.js';
import type { Project } from '../../../shared/types.js';

const mockProject: Project = {
  id: 'proj-k6',
  name: 'K6 Project',
  created_at: '2026-10-25T00:00:00Z',
  size_bytes: 2048,
  file_count: 5,
  languages: ['TypeScript'],
  last_scan_at: '2026-10-26T00:00:00Z',
};

function ChatPanelController() {
  const { isOpen, setIsOpen } = useChat();
  return (
    <div>
      <button data-testid="toggle-panel-btn" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? 'Close' : 'Open'}
      </button>
    </div>
  );
}

function TestHarness({
  initialProjectId = 'proj-k6',
}: {
  initialProjectId?: string | null;
}) {
  return (
    <MemoryRouter initialEntries={['/app/overview']}>
      <ProjectProvider initialProjectId={initialProjectId}>
        <ChatProvider>
          <ChatPanelController />
          <ChatPanel />
        </ChatProvider>
      </ProjectProvider>
    </MemoryRouter>
  );
}

describe('Step K6 Part 3: Draggable & Minimizable Chat Panel + Persistent History UI', () => {
  const originalFetch = globalThis.fetch;

  function setupFetchMock(options?: { historyItems?: any[]; onDelete?: () => void }) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);

      if (urlStr.includes('/chat/history')) {
        if (init?.method === 'DELETE') {
          options?.onDelete?.();
          return new Response(
            JSON.stringify({ data: { cleared: true }, error: null }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ data: { items: options?.historyItems ?? [] }, error: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/ai-settings')) {
        return new Response(
          JSON.stringify({
            data: {
              ai_enabled: true,
              share_code: false,
              consent_version: '2026-10-v2',
              current_consent_version: '2026-10-v2',
              consent_text: 'Consent text',
            },
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/api/ai/status')) {
        return new Response(
          JSON.stringify({
            data: { configured: true, provider: 'groq', model: 'llama-3.3-70b-versatile', demo_mode: false },
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/api/projects')) {
        return new Response(
          JSON.stringify({ data: [mockProject], error: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ data: [], error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    setupFetchMock();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. Dragging chat-drag-handle updates panel position and clamps off-screen coordinates', async () => {
    render(<TestHarness />);

    // Open panel
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
      expect(screen.getByTestId('chat-drag-handle')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('chat-panel');
    const dragHandle = screen.getByTestId('chat-drag-handle');

    // Mock getBoundingClientRect
    panel.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 100,
      top: 100,
      width: 380,
      height: 580,
    });

    // Mock window dimensions: 1000 x 800
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    // 1. Mouse down on drag handle at clientX=150, clientY=120 (offsetX = 50, offsetY = 20)
    fireEvent.mouseDown(dragHandle, { clientX: 150, clientY: 120, button: 0 });

    // 2. Move to clientX=250, clientY=220 -> rawLeft = 200, rawTop = 200
    fireEvent.mouseMove(window, { clientX: 250, clientY: 220 });

    expect(panel.style.left).toBe('200px');
    expect(panel.style.top).toBe('200px');

    // 3. Move off-screen to the right/bottom: clientX=2000, clientY=2000
    // Max left = Math.max(8, 1000 - 380 - 8) = 612
    // Max top = Math.max(8, 800 - 64) = 736
    fireEvent.mouseMove(window, { clientX: 2000, clientY: 2000 });
    expect(panel.style.left).toBe('612px');
    expect(panel.style.top).toBe('736px');

    // 4. Move off-screen to the left/top: clientX=-500, clientY=-500
    // Min left = 8, Min top = 8
    fireEvent.mouseMove(window, { clientX: -500, clientY: -500 });
    expect(panel.style.left).toBe('8px');
    expect(panel.style.top).toBe('8px');

    // 5. Mouse up ends dragging
    fireEvent.mouseUp(window);
  });

  it('2. Clicking buttons inside header does not move panel, and chat-reset-position resets position', async () => {
    render(<TestHarness />);

    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    });

    const panel = screen.getByTestId('chat-panel');
    const dragHandle = screen.getByTestId('chat-drag-handle');

    panel.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 100,
      top: 100,
      width: 380,
      height: 580,
    });

    // Drag away from default position
    fireEvent.mouseDown(dragHandle, { clientX: 150, clientY: 120, button: 0 });
    fireEvent.mouseMove(window, { clientX: 350, clientY: 220 });
    fireEvent.mouseUp(window);

    expect(panel.style.left).toBe('300px');
    expect(panel.style.top).toBe('200px');

    // chat-reset-position button should now be visible
    const resetBtn = screen.getByTestId('chat-reset-position');
    expect(resetBtn).toBeInTheDocument();

    // Clicking language toggle should NOT trigger drag
    const langBtn = screen.getByTitle('Toggle language');
    fireEvent.mouseDown(langBtn, { clientX: 500, clientY: 500, button: 0 });
    fireEvent.mouseMove(window, { clientX: 600, clientY: 600 });
    fireEvent.mouseUp(window);

    // Position unchanged by clicking child button
    expect(panel.style.left).toBe('300px');
    expect(panel.style.top).toBe('200px');

    // Click reset position button
    fireEvent.click(resetBtn);
    expect(panel.style.left).toBe('');
    expect(panel.style.top).toBe('');
    expect(screen.queryByTestId('chat-reset-position')).not.toBeInTheDocument();

    // Double clicking drag handle also resets position
    fireEvent.mouseDown(dragHandle, { clientX: 150, clientY: 120, button: 0 });
    fireEvent.mouseMove(window, { clientX: 350, clientY: 220 });
    fireEvent.mouseUp(window);
    expect(panel.style.left).toBe('300px');

    fireEvent.doubleClick(dragHandle);
    expect(panel.style.left).toBe('');
  });

  it('3. Clicking chat-minimize-button hides message body and input while keeping header visible', async () => {
    render(<TestHarness />);

    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });

    const minimizeBtn = screen.getByTestId('chat-minimize-button');
    expect(minimizeBtn).toHaveAttribute('aria-label', 'Minimize chat');

    // Minimize panel
    fireEvent.click(minimizeBtn);

    // Header and minimize button remain visible
    expect(screen.getByTestId('chat-drag-handle')).toBeInTheDocument();
    expect(screen.getByTestId('chat-minimize-button')).toHaveAttribute('aria-label', 'Expand chat');

    // Message list and input form are hidden/collapsed
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-message-list')).not.toBeInTheDocument();

    // Expand panel again
    fireEvent.click(screen.getByTestId('chat-minimize-button'));
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.getByTestId('chat-message-list')).toBeInTheDocument();
    expect(screen.getByTestId('chat-minimize-button')).toHaveAttribute('aria-label', 'Minimize chat');
  });

  it('4. Loads saved chat history from GET /api/projects/:id/chat/history on project mount and renders provider badge', async () => {
    const historyData = [
      {
        id: 'msg-1',
        project_id: 'proj-k6',
        role: 'user',
        content: 'What is circular dependency?',
        provider: null,
        model: null,
        created_at: '2026-10-26T10:00:00Z',
      },
      {
        id: 'msg-2',
        project_id: 'proj-k6',
        role: 'assistant',
        content: 'A circular dependency occurs when Module A imports Module B, and Module B imports Module A.',
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        created_at: '2026-10-26T10:00:05Z',
      },
    ];

    setupFetchMock({ historyItems: historyData });

    render(<TestHarness />);

    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    });

    // Wait for saved history items to render
    await waitFor(() => {
      expect(screen.getByText('What is circular dependency?')).toBeInTheDocument();
      expect(
        screen.getByText(
          'A circular dependency occurs when Module A imports Module B, and Module B imports Module A.'
        )
      ).toBeInTheDocument();
    });

    // Check provider badge is displayed
    const providerBadge = screen.getByTestId('chat-provider-badge');
    expect(providerBadge).toBeInTheDocument();
    expect(providerBadge.textContent).toBe('Groq');

    // Disclaimer string is intact
    expect(
      screen.getByText(/AI-written, may be wrong\. Ripple has not verified it\./)
    ).toBeInTheDocument();
  });

  it('5. Clicking chat-clear-button calls DELETE /api/projects/:id/chat/history and removes messages', async () => {
    let historyDeleted = false;

    setupFetchMock({
      historyItems: [
        {
          id: 'msg-clear-1',
          project_id: 'proj-k6',
          role: 'user',
          content: 'Message to be cleared',
          provider: null,
          model: null,
          created_at: '2026-10-26T10:00:00Z',
        },
      ],
      onDelete: () => {
        historyDeleted = true;
      },
    });

    render(<TestHarness />);

    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    await waitFor(() => {
      expect(screen.getByText('Message to be cleared')).toBeInTheDocument();
    });

    const clearBtn = screen.getByTestId('chat-clear-button');
    expect(clearBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(clearBtn);
    });

    // Message removed from DOM
    await waitFor(() => {
      expect(screen.queryByText('Message to be cleared')).not.toBeInTheDocument();
    });

    expect(historyDeleted).toBe(true);
  });
});
