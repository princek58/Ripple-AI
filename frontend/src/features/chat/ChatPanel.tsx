import React, {
  Suspense,
  useState,
  useEffect,
  useRef,
  Component,
  type ReactNode,
  type ErrorInfo,
} from 'react';
import { useChatSafe } from './ChatProvider.js';
import { Skeleton } from '../../components/ui/Skeleton.js';

export type ChatPanelLoader = () => Promise<{ default: React.ComponentType<any> }>;

let currentLoader: ChatPanelLoader = () => import('./ChatPanelContent.js');

export function setChatPanelLoaderForTesting(loader: ChatPanelLoader | null) {
  currentLoader = loader || (() => import('./ChatPanelContent.js'));
}

export function resetChatPanelLoaderForTesting() {
  currentLoader = () => import('./ChatPanelContent.js');
}

interface ErrorBoundaryProps {
  children: ReactNode;
  onRetry: () => void;
  onClose: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ChatPanelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // caught chunk loading error
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col h-full w-full select-text">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border bg-theme-surface/90 backdrop-blur-sm flex-shrink-0">
            <h1 className="font-heading font-semibold text-sm text-theme-text">Ripple AI</h1>
            <button
              type="button"
              onClick={this.props.onClose}
              className="p-1.5 text-sm rounded text-theme-text-muted hover:text-theme-text hover:bg-theme-surface-active transition-colors leading-none"
              aria-label="Close Ripple AI chat"
            >
              ✕
            </button>
          </div>

          {/* Failure message & Retry button */}
          <div
            className="flex flex-col items-center justify-center flex-1 p-6 text-center space-y-4"
            data-testid="chat-panel-load-error"
          >
            <p className="text-sm text-theme-text font-medium leading-relaxed max-w-xs">
              Could not load the chat. Check your connection and try again.
            </p>
            <button
              type="button"
              data-testid="chat-panel-retry-button"
              onClick={() => {
                this.setState({ hasError: false });
                this.props.onRetry();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-theme-primary text-theme-surface hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-theme-primary transition-opacity"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ChatPanelSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="flex flex-col h-full w-full select-none"
      data-testid="chat-panel-skeleton"
    >
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border bg-theme-surface/90 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-full" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-6 w-8 rounded-md" />
          <Skeleton className="h-6 w-6 rounded-md" />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-sm rounded text-theme-text-muted hover:text-theme-text hover:bg-theme-surface-active transition-colors leading-none"
            aria-label="Close Ripple AI chat"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Message area skeleton */}
      <div className="flex-1 p-4 space-y-3 overflow-hidden">
        <div className="p-3.5 rounded-xl border border-theme-border/60 bg-theme-surface-active/30 space-y-2.5">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-3 w-48 rounded-md" />
          <div className="pt-2 space-y-2">
            <Skeleton className="h-7 w-full rounded-lg" />
            <Skeleton className="h-7 w-full rounded-lg" />
            <Skeleton className="h-7 w-full rounded-lg" />
          </div>
        </div>
      </div>

      {/* Input area skeleton */}
      <div className="p-3 border-t border-theme-border bg-theme-surface flex-shrink-0">
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </div>
  );
}

export const ChatPanel: React.FC = () => {
  const chat = useChatSafe();
  if (!chat) return null;
  const { isOpen, setIsOpen, isMinimized, panelCoords } = chat;

  const [hasBeenOpened, setHasBeenOpened] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen && !hasBeenOpened) {
      setHasBeenOpened(true);
    }
  }, [isOpen, hasBeenOpened]);

  // Handle Escape key at panel root level
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        const circle = document.getElementById('ripple-chat-circle');
        if (circle) circle.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  // Phone focus trap
  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && panelRef.current) {
      const isPhone = window.innerWidth < 768;
      if (!isPhone) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    const circle = document.getElementById('ripple-chat-circle');
    if (circle) circle.focus();
  };

  // Lazy component instantiated on demand and memoized per retryKey
  const LazyChatPanelContent = React.useMemo(() => React.lazy(currentLoader), [retryKey]);

  if (!isOpen) {
    return null;
  }

  const panelStyle: React.CSSProperties = {
    ...(panelCoords
      ? {
          left: `${panelCoords.x}px`,
          top: `${panelCoords.y}px`,
          right: 'auto',
          bottom: 'auto',
        }
      : {}),
    ...(isMinimized
      ? {
          height: 'auto',
          maxHeight: 'none',
        }
      : {}),
  };

  return (
    <div
      ref={panelRef}
      id="ripple-chat-panel"
      data-testid="chat-panel"
      role="dialog"
      aria-label="Ripple AI chat"
      tabIndex={-1}
      onKeyDown={handlePanelKeyDown}
      style={panelStyle}
      className={`fixed inset-0 z-50 flex flex-col bg-theme-surface border border-theme-border shadow-2xl md:inset-auto md:w-[380px] md:rounded-2xl md:z-40 overflow-hidden font-sans ${
        panelCoords ? '' : 'md:bottom-20 md:right-6'
      } ${isMinimized ? 'md:h-auto md:max-h-none' : 'md:max-h-[70vh] md:h-[580px]'}`}
    >
      <ChatPanelErrorBoundary onRetry={() => setRetryKey((k) => k + 1)} onClose={handleClose}>
        <Suspense fallback={<ChatPanelSkeleton onClose={handleClose} />}>
          <LazyChatPanelContent key={retryKey} />
        </Suspense>
      </ChatPanelErrorBoundary>
    </div>
  );
};
