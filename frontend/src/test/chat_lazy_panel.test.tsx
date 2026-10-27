import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectProvider } from '../lib/projectContext.js';
import { ChatProvider } from '../features/chat/ChatProvider.js';
import { ChatCircle } from '../features/chat/ChatCircle.js';
import {
  ChatPanel,
  setChatPanelLoaderForTesting,
  resetChatPanelLoaderForTesting,
} from '../features/chat/ChatPanel.js';

function TestHarness() {
  return (
    <MemoryRouter initialEntries={['/app/overview']}>
      <ProjectProvider initialProjectId="proj-123">
        <ChatProvider>
          <ChatCircle />
          <ChatPanel />
        </ChatProvider>
      </ProjectProvider>
    </MemoryRouter>
  );
}

describe('ChatPanel Lazy Chunk Loading (K3 Part 1)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetChatPanelLoaderForTesting();
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ data: [], error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    resetChatPanelLoaderForTesting();
    globalThis.fetch = originalFetch;
  });

  it('first click loads the chunk and shows skeleton while pending (mock dynamic import)', async () => {
    let resolveChunk: (val: any) => void = () => {};
    const pendingPromise = new Promise<{ default: React.ComponentType<any> }>((resolve) => {
      resolveChunk = resolve;
    });

    const mockLoader = vi.fn().mockReturnValue(pendingPromise);
    setChatPanelLoaderForTesting(mockLoader);

    render(<TestHarness />);

    const circleBtn = screen.getByTestId('chat-circle-button');
    expect(circleBtn).toBeInTheDocument();

    // 1. Before click: loader is NOT called, panel is not in DOM
    expect(mockLoader).not.toHaveBeenCalled();
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();

    // 2. Click circle: loader is invoked for the first time
    fireEvent.click(circleBtn);
    expect(mockLoader).toHaveBeenCalledTimes(1);

    // 3. Panel frame is rendered and shows small skeleton while chunk loads
    const panel = screen.getByTestId('chat-panel');
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId('chat-panel-skeleton')).toBeInTheDocument();

    // 4. Resolve the chunk with a mock component
    const MockLoadedContent = () => (
      <div data-testid="mock-panel-content">
        <span>Mock Chat Content Loaded</span>
      </div>
    );

    await act(async () => {
      resolveChunk({ default: MockLoadedContent });
    });

    // 5. Skeleton disappears and chunk content is displayed inside panel frame
    await waitFor(() => {
      expect(screen.queryByTestId('chat-panel-skeleton')).not.toBeInTheDocument();
      expect(screen.getByTestId('mock-panel-content')).toBeInTheDocument();
    });
    expect(screen.getByText('Mock Chat Content Loaded')).toBeInTheDocument();
  });

  it('a failed import shows the message and Retry works', async () => {
    let callCount = 0;
    const mockLoader = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First load attempt fails (network failure / connection error)
        return Promise.reject(new Error('Network error loading chat chunk'));
      }
      // Subsequent retry attempt succeeds
      return Promise.resolve({
        default: () => (
          <div data-testid="retry-success-content">
            <span>Successfully Loaded After Retry</span>
          </div>
        ),
      });
    });

    setChatPanelLoaderForTesting(mockLoader);

    render(<TestHarness />);

    const circleBtn = screen.getByTestId('chat-circle-button');

    // Click to open -> triggers failed dynamic import
    fireEvent.click(circleBtn);
    expect(mockLoader).toHaveBeenCalledTimes(1);

    // Error message and Retry button appear inside the panel frame
    const errorContainer = await screen.findByTestId('chat-panel-load-error');
    expect(errorContainer).toBeInTheDocument();
    expect(
      screen.getByText('Could not load the chat. Check your connection and try again.')
    ).toBeInTheDocument();

    const retryBtn = screen.getByTestId('chat-panel-retry-button');
    expect(retryBtn).toBeInTheDocument();

    // Click Retry -> loader is called again and succeeds
    fireEvent.click(retryBtn);

    expect(mockLoader).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(screen.queryByTestId('chat-panel-load-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('retry-success-content')).toBeInTheDocument();
    });
    expect(screen.getByText('Successfully Loaded After Retry')).toBeInTheDocument();
  });

  it('circle test suites still pass and circle stays functional when panel is closed and re-opened', async () => {
    // Normal loader (loads actual ChatPanelContent)
    resetChatPanelLoaderForTesting();

    render(<TestHarness />);

    const circleBtn = screen.getByTestId('chat-circle-button');
    expect(circleBtn).toHaveAttribute('aria-expanded', 'false');

    // Open chat
    fireEvent.click(circleBtn);
    expect(circleBtn).toHaveAttribute('aria-expanded', 'true');

    // Real content loads
    expect(await screen.findByTestId('chat-welcome-card')).toBeInTheDocument();

    // Close chat via circle
    fireEvent.click(circleBtn);
    expect(circleBtn).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => {
      expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();
    });
  });
});
