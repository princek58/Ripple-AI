import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectProvider } from '../lib/projectContext.js';
import { ChatProvider, useChat } from '../features/chat/ChatProvider.js';
import { ChatPanel } from '../features/chat/ChatPanel.js';
import type { Project } from '../../../shared/types.js';

const mockProject: Project = {
  id: 'proj-stream-123',
  name: 'Streaming Test Project',
  created_at: '2026-10-20T00:00:00Z',
  size_bytes: 2048,
  file_count: 8,
  languages: ['TypeScript'],
  last_scan_at: '2026-10-21T00:00:00Z',
};

function TestHarness({
  initialEntries = ['/app/overview'],
}: {
  initialEntries?: string[];
}) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <ProjectProvider initialProjectId="proj-stream-123">
        <ChatProvider>
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
  const { isOpen, setIsOpen } = useChat();
  return (
    <div>
      <button data-testid="toggle-chat-btn" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? 'Close' : 'Open'}
      </button>
    </div>
  );
}

/**
 * Creates a mock ReadableStream that emits SSE chunks with delays.
 */
function createMockSSEStream(chunks: string[], delayMs = 15): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      const chunkStr = chunks[index++];
      controller.enqueue(encoder.encode(chunkStr));
    },
  });
}

describe('Frontend Streaming Chat & Typewriter Effect (SSE)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  function setupStreamingFetchMock(streamChunks: string[], options: { status?: number; provider?: string } = {}) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes('/ai-settings')) {
        return new Response(
          JSON.stringify({
            data: {
              ai_enabled: true,
              share_code: false,
              consent_version: '2026-10-v2',
              current_consent_version: '2026-10-v2',
              consent_text: 'Consent agreement text',
            },
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/chat/history')) {
        return new Response(JSON.stringify({ data: { items: [] }, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/chat')) {
        if (options.status && options.status >= 400) {
          return new Response(JSON.stringify({ data: null, error: 'AI_RATE_LIMITED' }), {
            status: options.status,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const stream = createMockSSEStream(streamChunks);
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }

      if (urlStr.includes('/api/ai/status')) {
        return new Response(
          JSON.stringify({
            data: {
              configured: true,
              provider: options.provider || 'groq',
              model: 'llama-3.3-70b-versatile',
              demo_mode: false,
            },
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/api/projects')) {
        return new Response(JSON.stringify({ data: [mockProject], error: null }), {
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

  it('1. streams text chunks live, displays typewriter cursor during streaming, and removes cursor on completion', async () => {
    const sseChunks = [
      'data: {"delta":"This is "}\n\n',
      'data: {"delta":"a live streaming "}\n\n',
      'data: {"delta":"response from Groq!"}\n\n',
      'data: {"done":true,"provider":"groq","model":"llama-3.3-70b-versatile","source":"ai"}\n\n',
      'data: [DONE]\n\n',
    ];

    setupStreamingFetchMock(sseChunks, { provider: 'groq' });
    render(<TestHarness />);

    // Open chat panel
    fireEvent.click(screen.getByTestId('toggle-chat-btn'));

    // Verify AI status is loaded
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = await screen.findByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'Explain architecture streaming' } });
    fireEvent.click(screen.getByTestId('chat-send-btn'));

    // Wait for the message to appear and stream with typewriter cursor visible
    await waitFor(() => {
      expect(screen.getByTestId('chat-typewriter-cursor')).toBeInTheDocument();
    });

    // Wait for stream completion: typewriter cursor disappears and Copy button is active
    await waitFor(
      () => {
        expect(screen.queryByTestId('chat-typewriter-cursor')).not.toBeInTheDocument();
        expect(
          screen.getByText(/This is a live streaming response from Groq!/i)
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Copy answer/i })).toHaveTextContent('Copy');
      },
      { timeout: 3000 }
    );
  });

  it('2. displays the active provider badge live as soon as chunks arrive', async () => {
    const sseChunks = [
      'data: {"delta":"Gemini streaming chunk.","provider":"gemini","model":"gemini-1.5-flash"}\n\n',
      'data: {"done":true,"provider":"gemini","model":"gemini-1.5-flash","source":"gemini"}\n\n',
      'data: [DONE]\n\n',
    ];

    setupStreamingFetchMock(sseChunks, { provider: 'gemini' });
    render(<TestHarness />);

    fireEvent.click(screen.getByTestId('toggle-chat-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = await screen.findByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'Test provider badge' } });
    fireEvent.click(screen.getByTestId('chat-send-btn'));

    // Provider badge should display Gemini
    const providerBadge = await screen.findByTestId('chat-provider-badge');
    expect(providerBadge).toHaveTextContent('Gemini');
  });

  it('3. stop button aborts the stream and returns input to ready state', async () => {
    // Large delayed stream
    const sseChunks = [
      'data: {"delta":"Starting long stream... "}\n\n',
      'data: {"delta":"chunk 2... "}\n\n',
      'data: {"delta":"chunk 3... "}\n\n',
    ];

    setupStreamingFetchMock(sseChunks);
    render(<TestHarness />);

    fireEvent.click(screen.getByTestId('toggle-chat-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = await screen.findByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'Test stop streaming' } });
    fireEvent.click(screen.getByTestId('chat-send-btn'));

    // Stop button appears while busy
    const stopBtn = await screen.findByRole('button', { name: /Stop request/i });
    expect(stopBtn).toBeInTheDocument();

    // Click stop
    fireEvent.click(stopBtn);

    // Stop button disappears and Send button returns
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Stop request/i })).not.toBeInTheDocument();
      expect(screen.getByTestId('chat-send-btn')).toBeInTheDocument();
    });
  });

  it('4. displays error message with retry button when stream endpoint returns non-200 error', async () => {
    setupStreamingFetchMock([], { status: 429 });
    render(<TestHarness />);

    fireEvent.click(screen.getByTestId('toggle-chat-btn'));
    expect(await screen.findByText('AI on')).toBeInTheDocument();

    const input = await screen.findByTestId('chat-input');
    fireEvent.change(input, { target: { value: 'Test rate limit error' } });
    fireEvent.click(screen.getByTestId('chat-send-btn'));

    // Error bubble appears with Retry button
    const errorMsg = await screen.findByTestId('chat-error-message');
    expect(errorMsg).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });
});
