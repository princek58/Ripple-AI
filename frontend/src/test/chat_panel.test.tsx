import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectProvider, useProjects } from '../lib/projectContext.js';
import { ChatProvider, useChat } from '../features/chat/ChatProvider.js';
import { ChatPanel } from '../features/chat/ChatPanel.js';
import type { Project } from '../../../shared/types.js';

// Load fixture data
import aiStatusFixture from './fixtures/api/ai_status.json';
import aiSettingsDefaultFixture from './fixtures/api/ai_settings_default.json';
import aiSettingsEnableFixture from './fixtures/api/ai_settings_put_enable.json';
import aiChatSuccessFixture from './fixtures/api/ai_chat_success.json';

const mockProjectScanned: Project = {
  id: 'proj-123',
  name: 'Demo ERP',
  created_at: '2026-10-20T00:00:00Z',
  size_bytes: 1024,
  file_count: 10,
  languages: ['JavaScript', 'TypeScript'],
  last_scan_at: '2026-10-21T00:00:00Z',
};

const mockProjectUnscanned: Project = {
  id: 'proj-unscanned',
  name: 'Unscanned Project',
  created_at: '2026-10-20T00:00:00Z',
  size_bytes: 1024,
  file_count: 5,
  languages: ['JavaScript'],
  last_scan_at: null,
};

interface TestHarnessProps {
  initialEntries?: string[];
  initialProjectId?: string | null;
}

function TestHarness({
  initialEntries = ['/app/overview'],
  initialProjectId = 'proj-123',
}: TestHarnessProps) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <ProjectProvider initialProjectId={initialProjectId}>
        <ChatProvider>
          {/* Mock circle button for focus return tests */}
          <button id="ripple-chat-circle" aria-label="Open Ripple AI chat">
            Circle
          </button>
          <ChatPanelController />
          <ChatPanel />
        </ChatProvider>
      </ProjectProvider>
    </MemoryRouter>
  );
}

function ChatPanelController() {
  const { isOpen, setIsOpen, messages, sendMessage } = useChat();
  const { setSelectedProjectId } = useProjects();
  return (
    <div>
      <button
        data-testid="toggle-panel-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? 'Close' : 'Open'}
      </button>
      <button
        data-testid="switch-proj-btn"
        onClick={() => setSelectedProjectId('proj-unscanned')}
      >
        Switch Project
      </button>
      <button
        data-testid="send-direct-btn"
        onClick={() => sendMessage('Direct call')}
      >
        Send Direct
      </button>
      <span data-testid="msg-count">{messages.length}</span>
    </div>
  );
}

describe('ChatPanel & ChatProvider (K2 Part 2)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  function setupFetchMock(customResponses?: Record<string, any>) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);

      if (urlStr.includes('/chat/history') && (!customResponses || !customResponses['/chat/history'])) {
        return new Response(JSON.stringify({ data: { items: [] }, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (customResponses) {
        for (const [pattern, resp] of Object.entries(customResponses)) {
          if (urlStr.includes(pattern)) {
            if (typeof resp === 'function') {
              const resPromise = resp(urlStr, init);
              if (resPromise instanceof Promise && init?.signal) {
                return new Promise((resolve, reject) => {
                  init.signal!.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                  });
                  resPromise.then(resolve, reject);
                });
              }
              return resPromise;
            }
            return new Response(JSON.stringify(resp), {
              status: resp.error ? (resp.status || 400) : 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      }

      if (urlStr.includes('/ai-settings')) {
        return new Response(JSON.stringify(aiSettingsEnableFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/chat')) {
        return new Response(JSON.stringify(aiChatSuccessFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/api/ai/status')) {
        return new Response(JSON.stringify(aiStatusFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/api/projects')) {
        return new Response(JSON.stringify({ data: [mockProjectScanned, mockProjectUnscanned], error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data: null, error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  it('1. renders welcome message and screen-specific examples on first open', async () => {
    setupFetchMock();
    render(<TestHarness initialEntries={['/app/graph']} />);

    // Open panel
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));

    expect(await screen.findByTestId('chat-welcome-card')).toBeInTheDocument();
    expect(screen.getByText('What is a circular dependency?')).toBeInTheDocument();
    expect(screen.getByText('What is an isolated file?')).toBeInTheDocument();
    expect(screen.getByText('How do I interpret graph levels?')).toBeInTheDocument();

    // Clicking an example question sends it
    fireEvent.click(screen.getByText('What is a circular dependency?'));

    // Welcome card disappears as message is sent
    await waitFor(() => {
      expect(screen.queryByTestId('chat-welcome-card')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('chat-user-message')).toHaveTextContent('What is a circular dependency?');
  });

  it('2. offline answer appears immediately for "circular dependency kya hai" when AI is off', async () => {
    setupFetchMock({
      '/ai-settings': aiSettingsDefaultFixture,
    });
    render(<TestHarness initialEntries={['/app/overview']} />);

    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    await screen.findByTestId('chat-welcome-card');

    const input = screen.getByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'circular dependency kya hai' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    // Immediate offline answer
    const offlineMsg = await screen.findByTestId('chat-offline-message');
    expect(offlineMsg).toBeInTheDocument();
    expect(offlineMsg).toHaveTextContent(/Offline help/i);
    expect(offlineMsg).toHaveTextContent(/Circular dependency/i);
  });

  it('3. AI success replaces thinking indicator and shows AI label and Copy button', async () => {
    setupFetchMock();
    render(<TestHarness initialEntries={['/app/overview']} />);

    fireEvent.click(screen.getByTestId('toggle-panel-btn'));

    // Wait for settings to load and badge to indicate AI on
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask Ripple AI.../i);

    // Mock clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    fireEvent.change(input, { target: { value: 'How does Ripple AI work?' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    // AI message appears and thinking indicator is replaced
    const aiMsg = await screen.findByTestId('chat-ai-message');
    expect(aiMsg).toBeInTheDocument();
    expect(aiMsg).toHaveTextContent('AI-written, may be wrong. Ripple has not verified it.');
    expect(screen.queryByTestId('chat-thinking-indicator')).not.toBeInTheDocument();

    // Click Copy button
    const copyBtn = screen.getByRole('button', { name: /Copy answer/i });
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalled();
    expect(copyBtn).toHaveTextContent('Copied!');
  });

  it('4. displays 12-second warning message when request takes longer than usual', async () => {
    vi.useFakeTimers();

    setupFetchMock({
      '/chat': () => new Promise(() => {}), // never resolves
    });

    render(<TestHarness />);

    // Open panel
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const input = screen.getByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'circular dependency' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    expect(screen.getByTestId('chat-thinking-indicator')).toHaveTextContent('Ripple AI is thinking...');

    // Fast-forward 12 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12001);
    });

    expect(screen.getByTestId('chat-thinking-indicator')).toHaveTextContent(
      'Taking longer than usual. Offline help is shown above'
    );
  });

  it('5. aborts request at 40 seconds and shows friendly timeout message', async () => {
    vi.useFakeTimers();

    setupFetchMock({
      '/chat': () => new Promise(() => {}), // hangs until signal aborts
    });

    render(<TestHarness />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const input = screen.getByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'Explain graph' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    // Fast-forward past 40s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40100);
    });

    const errorMsg = screen.getByTestId('chat-error-message');
    expect(errorMsg).toBeInTheDocument();
    expect(errorMsg).toHaveTextContent(
      'The AI service is slow or busy right now. Offline help is shown below.'
    );
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    expect(screen.getByTestId('chat-offline-message')).toBeInTheDocument();
  });

  it('6. maps every error code with friendly message and keeps offline answer intact', async () => {
    const errorCodes = [
      { code: 'AI_DISABLED', expected: 'AI is off for this project. Turn it on in the chat settings' },
      { code: 'AI_DISABLED [CONSENT_OUTDATED]', expected: 'The AI privacy note was updated. Please accept it again to use AI.' },
      { code: 'AI_RATE_LIMITED', expected: 'Too many requests right now' },
      { code: 'AI_QUOTA_EXHAUSTED', expected: 'The AI service has reached its free limit' },
      { code: 'AI_AUTH_FAILED', expected: 'AI service could not authenticate' },
      { code: 'AI_UNAVAILABLE', expected: 'AI service is slow or busy right now' },
    ];

    for (const { code, expected } of errorCodes) {
      setupFetchMock({
        '/chat': { data: null, error: `${code} [ERROR_DETAIL]`, status: 400 },
      });

      const { unmount } = render(<TestHarness />);
      fireEvent.click(screen.getByTestId('toggle-panel-btn'));

      // Wait for AI on
      expect(await screen.findByText('AI on')).toBeInTheDocument();

      const input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);
      fireEvent.change(input, { target: { value: 'circular dependency kya hai' } });
      fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

      // Both offline answer and friendly error message must exist
      const offline = await screen.findByTestId('chat-offline-message');
      expect(offline).toBeInTheDocument();
      expect(offline).toHaveTextContent(/Circular dependency/i);

      const err = await screen.findByTestId('chat-error-message');
      expect(err).toHaveTextContent(expected);

      unmount();
    }
  });

  it('7. Stop button aborts in-flight request', async () => {
    let aborted = false;
    setupFetchMock({
      '/chat': (_url: string, init?: RequestInit) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
        });
        return new Promise(() => {}); // hangs until abort
      },
    });

    render(<TestHarness />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'Heavy calculation' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    const stopBtn = await screen.findByRole('button', { name: /Stop request/i });
    expect(stopBtn).toBeInTheDocument();
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(aborted).toBe(true);
    });
    expect(await screen.findByText('Request cancelled')).toBeInTheDocument();
  });

  it('8. double-click sends only one request', async () => {
    let chatCallCount = 0;
    let resolveChat: (() => void) | null = null;
    setupFetchMock({
      '/chat': () => {
        chatCallCount += 1;
        return new Promise((resolve) => {
          resolveChat = () =>
            resolve(
              new Response(JSON.stringify(aiChatSuccessFixture), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            );
        });
      },
    });

    render(<TestHarness />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'Test double submit' } });

    const sendBtn = screen.getByRole('button', { name: /Send message/i });
    fireEvent.click(sendBtn);
    // Rapid concurrent submit while request is in flight:
    fireEvent.click(screen.getByTestId('send-direct-btn'));

    if (resolveChat) (resolveChat as any)();

    await waitFor(() => {
      expect(screen.getByTestId('chat-ai-message')).toBeInTheDocument();
    });
    expect(chatCallCount).toBe(1);
  });

  it('9. caps history at 6 turns and cuts each text at 1000 characters', async () => {
    let lastChatBody: any = null;
    setupFetchMock({
      '/chat': (_url: string, init?: RequestInit) => {
        lastChatBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(aiChatSuccessFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    render(<TestHarness />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);

    // Send 7 messages to exceed history limit
    for (let i = 1; i <= 7; i++) {
      fireEvent.change(input, { target: { value: `Message ${i} ${'x'.repeat(1100)}` } });
      fireEvent.click(screen.getByRole('button', { name: /Send message/i }));
      await waitFor(() => {
        expect(screen.queryByTestId('chat-thinking-indicator')).not.toBeInTheDocument();
      });
    }

    expect(lastChatBody).not.toBeNull();
    expect(lastChatBody.history.length).toBeLessThanOrEqual(6);
    for (const h of lastChatBody.history) {
      expect(h.text.length).toBeLessThanOrEqual(1000);
    }
  });

  it('10. request body contains only valid screen and ids with no extra keys', async () => {
    let capturedBody: any = null;
    setupFetchMock({
      '/chat': (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(aiChatSuccessFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const path =
      '/app/investigations?finding=00000000-0000-0000-0000-000000000001&focus=00000000-0000-0000-0000-000000000002&fix=00000000-0000-0000-0000-000000000003&report=00000000-0000-0000-0000-000000000004';
    render(<TestHarness initialEntries={[path]} />);

    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'Inspect finding' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    const allowedKeys = [
      'message',
      'screen',
      'lang',
      'history',
      'finding_id',
      'node_id',
      'fix_id',
      'report_id',
    ];
    Object.keys(capturedBody).forEach((k) => {
      expect(allowedKeys).toContain(k);
    });
    expect(capturedBody.screen).toBe('investigations');
    expect(capturedBody.finding_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(capturedBody.node_id).toBe('00000000-0000-0000-0000-000000000002');
    expect(capturedBody.fix_id).toBe('00000000-0000-0000-0000-000000000003');
    expect(capturedBody.report_id).toBe('00000000-0000-0000-0000-000000000004');
  });

  it('11. renders HTML-looking text as plain text and creates no DOM element', async () => {
    const maliciousPayload = '<img src=x onerror=alert(1)>';
    setupFetchMock({
      '/chat': {
        data: {
          text: maliciousPayload,
          source: 'test',
          provider: 'test',
          model: 'test',
        },
        error: null,
      },
    });

    render(<TestHarness />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: maliciousPayload } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    await waitFor(() => {
      expect(screen.getByTestId('chat-ai-message')).toBeInTheDocument();
    });

    // Check that NO <img> elements were injected
    expect(document.querySelector('img')).toBeNull();
    // But literal text is visible
    expect(screen.getByTestId('chat-user-message')).toHaveTextContent(maliciousPayload);
    expect(screen.getByTestId('chat-ai-message')).toHaveTextContent(maliciousPayload);
  });

  it('12. Escape key closes the panel and returns focus to the circle button', async () => {
    setupFetchMock();
    render(<TestHarness />);

    const circleBtn = screen.getByRole('button', { name: /Open Ripple AI chat/i });
    circleBtn.focus();
    expect(document.activeElement).toBe(circleBtn);

    // Open panel
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(screen.getByRole('dialog', { name: /Ripple AI chat/i })).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    // Panel is closed
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Ripple AI chat/i })).not.toBeInTheDocument();
    });
    // Focus returned to circle
    expect(document.activeElement).toBe(circleBtn);
  });

  it('13. traps focus on phone viewport', async () => {
    setupFetchMock();
    // Simulate phone width
    window.innerWidth = 400;

    render(<TestHarness />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));

    const panel = screen.getByRole('dialog', { name: /Ripple AI chat/i });
    const closeBtn = await screen.findByRole('button', { name: /Close Ripple AI chat/i });
    const sendBtn = await screen.findByRole('button', { name: /Send message/i });

    // Focus last element and hit Tab -> should loop
    sendBtn.focus();
    fireEvent.keyDown(panel, { key: 'Tab', code: 'Tab', shiftKey: false });

    // Focus first element and hit Shift+Tab -> should loop
    closeBtn.focus();
    fireEvent.keyDown(panel, { key: 'Tab', code: 'Tab', shiftKey: true });
    expect(panel).toBeInTheDocument();
  });

  it('14. handles AI off, not configured, unscanned, and unselected states with offline answers only', async () => {
    // 14a. AI off
    setupFetchMock({
      '/ai-settings': aiSettingsDefaultFixture, // ai_enabled: false
    });

    const { unmount: u1 } = render(<TestHarness />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    let input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'circular dependency' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    let offMsg = await screen.findByTestId('chat-offline-message');
    expect(offMsg).toHaveTextContent(/AI is off for this project/i);
    expect(screen.queryByTestId('chat-thinking-indicator')).not.toBeInTheDocument();
    u1();

    // 14b. AI not configured
    setupFetchMock({
      '/api/ai/status': { data: { configured: false, provider: null, model: null }, error: null },
    });
    const { unmount: u2 } = render(<TestHarness />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'circular dependency' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    offMsg = await screen.findByTestId('chat-offline-message');
    expect(offMsg).toHaveTextContent(/The AI service is not set up on this server/i);
    u2();

    // 14c. Unscanned project
    setupFetchMock();
    const { unmount: u3 } = render(
      <TestHarness initialProjectId="proj-unscanned" />
    );
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'circular dependency' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    offMsg = await screen.findByTestId('chat-offline-message');
    expect(offMsg).toHaveTextContent(/Project is not scanned yet/i);
    u3();

    // 14d. No project selected
    setupFetchMock({
      '/api/projects': { data: [], error: null },
    });
    const { unmount: u4 } = render(<TestHarness initialProjectId={null} />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'circular dependency' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    offMsg = await screen.findByTestId('chat-offline-message');
    expect(offMsg).toHaveTextContent(/No project selected/i);
    u4();
  });

  it('15. switching project clears conversation and aborts request', async () => {
    let chatAborted = false;
    setupFetchMock({
      '/chat': (_url: string, init?: RequestInit) => {
        init?.signal?.addEventListener('abort', () => {
          chatAborted = true;
        });
        return new Promise(() => {}); // hang
      },
    });

    render(<TestHarness initialProjectId="proj-123" />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = await screen.findByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'Test message before switch' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    await waitFor(() => {
      expect(screen.getByTestId('msg-count')).not.toHaveTextContent('0');
    });

    // Now switch project
    fireEvent.click(screen.getByTestId('switch-proj-btn'));

    await waitFor(() => {
      expect(chatAborted).toBe(true);
      expect(screen.getByTestId('msg-count')).toHaveTextContent('0');
    });
  });

  it('16. AI on shows NO offline box before the AI answer arrives', async () => {
    let resolveChat: ((val: any) => void) | null = null;
    setupFetchMock({
      '/chat': () =>
        new Promise((resolve) => {
          resolveChat = resolve;
        }),
    });

    render(<TestHarness initialEntries={['/app/overview']} />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'Explain graph structure' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    // Indicator is thinking, and NO offline message exists
    expect(screen.getByTestId('chat-thinking-indicator')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-offline-message')).not.toBeInTheDocument();

    // Resolve AI answer
    act(() => {
      if (resolveChat) {
        resolveChat(
          new Response(JSON.stringify(aiChatSuccessFixture), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
    });

    // AI message appears, thinking indicator removed, still NO offline box
    expect(await screen.findByTestId('chat-ai-message')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-thinking-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-offline-message')).not.toBeInTheDocument();
  });

  it('17. user question and AI answer both remain visible in DOM in order with You label', async () => {
    setupFetchMock({
      '/chat': {
        data: {
          text: 'This is the AI answer explaining circular dependencies.',
          source: 'test',
          provider: 'test',
          model: 'test',
        },
        error: null,
      },
    });

    render(<TestHarness initialEntries={['/app/overview']} />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'Why are there circular dependencies?' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    // Both user message and AI message are present in DOM
    const userMsg = await screen.findByTestId('chat-user-message');
    expect(userMsg).toBeInTheDocument();
    expect(userMsg).toHaveTextContent('Why are there circular dependencies?');
    expect(userMsg).toHaveTextContent('You');

    const aiMsg = await screen.findByTestId('chat-ai-message');
    expect(aiMsg).toBeInTheDocument();
    expect(aiMsg).toHaveTextContent('This is the AI answer explaining circular dependencies.');

    // Verify ordering: user message precedes AI message
    const allMessages = screen.getAllByTestId(/chat-(user|ai)-message/);
    expect(allMessages.length).toBe(2);
    expect(allMessages[0]).toHaveAttribute('data-testid', 'chat-user-message');
    expect(allMessages[1]).toHaveAttribute('data-testid', 'chat-ai-message');
  });

  it('18. outdated consent version does not block AI chat and allows normal interaction', async () => {
    setupFetchMock({
      '/ai-settings': {
        data: {
          project_id: 'proj-123',
          ai_enabled: true,
          share_code: true,
          consent_version: '2026-10-v1', // Older consent version
          current_consent_version: '2026-10-v2',
        },
        error: null,
      },
      '/chat': {
        data: {
          text: 'Architecture advice for your project.',
          source: 'test',
          provider: 'test',
          model: 'test',
        },
        error: null,
      },
    });

    render(<TestHarness initialEntries={['/app/overview']} />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));

    // Status badge is AI on
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'Help with architecture' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    // Directly receives AI answer without consent roadblocks or consent card
    expect(await screen.findByTestId('chat-ai-message')).toHaveTextContent('Architecture advice for your project.');
    expect(screen.queryByTestId('chat-consent-card')).not.toBeInTheDocument();
  });

  it('19. fenced code block renders as monospace text, Copy button copies code, and XSS payload creates no DOM element', async () => {
    const maliciousCode = '<img src=x onerror=alert(1)>';
    const textWithFencedBlock = `Here is sample code:\n\`\`\`javascript\n${maliciousCode}\nconsole.log("hello");\n\`\`\`\nOutside fence: <img src=y onerror=alert(2)>`;

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    setupFetchMock({
      '/chat': {
        data: {
          text: textWithFencedBlock,
          source: 'test',
          provider: 'test',
          model: 'test',
        },
        error: null,
      },
    });

    render(<TestHarness initialEntries={['/app/overview']} />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'Show me code' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    const aiMsg = await screen.findByTestId('chat-ai-message');
    expect(aiMsg).toBeInTheDocument();

    // Verify <pre> and <code> block with monospace font
    const codeBlock = aiMsg.querySelector('pre code');
    expect(codeBlock).not.toBeNull();
    expect(codeBlock).toHaveTextContent(maliciousCode);
    expect(codeBlock?.className).toContain('font-mono');

    // Verify Copy button for code block
    const copyCodeBtn = screen.getByRole('button', { name: /Copy code/i });
    expect(copyCodeBtn).toBeInTheDocument();
    fireEvent.click(copyCodeBtn);
    expect(writeTextMock).toHaveBeenCalledWith(`${maliciousCode}\nconsole.log("hello");`);
    expect(copyCodeBtn).toHaveTextContent('Copied!');

    // Critical security check: No <img> tag created anywhere in document
    expect(document.querySelector('img')).toBeNull();
    // Literal text present outside fence
    expect(aiMsg).toHaveTextContent('Outside fence: <img src=y onerror=alert(2)>');
  });

  it('20. unclosed code fence renders as plain text without throwing or crashing', async () => {
    const unclosedText = 'Unclosed snippet:\n```typescript\nconst active = true;\nlet count = 42;';

    setupFetchMock({
      '/chat': {
        data: {
          text: unclosedText,
          source: 'test',
          provider: 'test',
          model: 'test',
        },
        error: null,
      },
    });

    render(<TestHarness initialEntries={['/app/overview']} />);
    fireEvent.click(screen.getByTestId('toggle-panel-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask Ripple AI.../i);
    fireEvent.change(input, { target: { value: 'Show unclosed' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    const aiMsg = await screen.findByTestId('chat-ai-message');
    expect(aiMsg).toBeInTheDocument();
    expect(aiMsg).toHaveTextContent('Unclosed snippet:');
    expect(aiMsg).toHaveTextContent('const active = true;');
  });
});
