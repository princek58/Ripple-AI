import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useProjects } from '../../lib/projectContext.js';
import { useExplainLanguage } from '../../lib/useExplainLanguage.js';
import { contextIdsFromUrl } from './urlHelpers.js';
import { chatErrorMessage } from './errorMessages.js';
import { trimHistory } from './trimHistory.js';
import {
  fetchAiStatus,
  fetchProjectAiSettings,
  putProjectAiSettings,
  postChatMessage,
} from './chatApi.js';
import type {
  AiStatusData,
  ProjectAiSettings,
  ChatLang,
} from './types.js';

let cachedGlossary: {
  offlineAnswer: (question: string, context?: any, lang?: any) => string;
  hasGlossaryMatch: (question: string) => boolean;
} | null = null;

export function setCachedGlossary(m: {
  offlineAnswer: (question: string, context?: any, lang?: any) => string;
  hasGlossaryMatch: (question: string) => boolean;
}) {
  cachedGlossary = m;
}

export function loadGlossarySyncOrAsync(): Promise<void> | null {
  if (cachedGlossary) return null;
  return import('./glossary.js').then((m) => {
    cachedGlossary = {
      offlineAnswer: m.offlineAnswer,
      hasGlossaryMatch: m.hasGlossaryMatch,
    };
  });
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  type?: 'user' | 'offline' | 'ai' | 'thinking' | 'error';
  isThinking?: boolean;
  canRetry?: boolean;
  source?: string;
  provider?: string;
  model?: string;
}

export interface ChatContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  messages: ChatMessage[];
  busy: boolean;
  lang: ChatLang;
  setLang: (lang: ChatLang) => void;
  aiStatus: AiStatusData | null;
  aiSettings: ProjectAiSettings | null;
  statusLoading: boolean;
  settingsLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  stopRequest: () => void;
  retryLastMessage: () => void;
  clearMessages: () => void;
  refreshSettings: () => Promise<void>;
  updateSettings: (body: {
    ai_enabled: boolean;
    share_code?: boolean;
    consent_version?: string;
  }) => Promise<void>;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatSafe(): ChatContextValue | null {
  return useContext(ChatContext);
}

let msgCounter = 0;
function uniqueMsgId(prefix: string): string {
  msgCounter += 1;
  return `${prefix}-${Date.now()}-${msgCounter}`;
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedProjectId, selectedProject } = useProjects();
  const location = useLocation();
  const [langRaw, setLangRaw] = useExplainLanguage();
  const lang: ChatLang = langRaw === 'hi' ? 'hi' : 'en';

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState<boolean>(false);

  const [aiStatus, setAiStatus] = useState<AiStatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);

  const [aiSettings, setAiSettings] = useState<ProjectAiSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const prevProjectIdRef = useRef<string | null>(selectedProjectId);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const setLang = useCallback(
    (nextLang: ChatLang) => {
      setLangRaw(nextLang);
    },
    [setLangRaw]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Fetch global AI status on mount
  useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    fetchAiStatus()
      .then((status) => {
        if (!cancelled) setAiStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setAiStatus({ configured: false, provider: null, model: null });
        }
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh project AI settings
  const refreshSettings = useCallback(async () => {
    if (!selectedProjectId) {
      setAiSettings(null);
      return;
    }
    setSettingsLoading(true);
    try {
      const settings = await fetchProjectAiSettings(selectedProjectId);
      setAiSettings(settings);
    } catch {
      setAiSettings(null);
    } finally {
      setSettingsLoading(false);
    }
  }, [selectedProjectId]);

  // Fetch project settings when selected project changes
  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // Clear conversation and abort in-flight request when project switches
  useEffect(() => {
    if (prevProjectIdRef.current !== selectedProjectId) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setMessages([]);
      setBusy(false);
      prevProjectIdRef.current = selectedProjectId;
    }
  }, [selectedProjectId]);

  const updateSettings = useCallback(
    async (body: {
      ai_enabled: boolean;
      share_code?: boolean;
      consent_version?: string;
    }) => {
      if (!selectedProjectId) {
        throw new Error('No project selected');
      }
      const updated = await putProjectAiSettings(selectedProjectId, body);
      setAiSettings(updated);
    },
    [selectedProjectId]
  );

  const stopRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort('USER_ABORT');
      abortControllerRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (busy) return;
      const clean = text.trim();
      if (!clean) return;

      const userMsg: ChatMessage = {
        id: uniqueMsgId('user'),
        role: 'user',
        text: clean.slice(0, 1500),
        type: 'user',
      };

      // Determine context from URL
      const pathname = location.pathname;
      const search = location.search;
      const ctx = contextIdsFromUrl(pathname, search);

      if (!cachedGlossary) {
        await loadGlossarySyncOrAsync();
      }

      const hasMatch = cachedGlossary
        ? cachedGlossary.hasGlossaryMatch(clean) || Boolean(ctx.finding_id)
        : Boolean(ctx.finding_id);
      const isConfigured = aiStatus?.configured === true;
      const isAiOn = aiSettings?.ai_enabled === true;
      const isScanned = Boolean(selectedProject?.last_scan_at);
      const currentProjectId = selectedProjectId;
      const hasProject = Boolean(currentProjectId);

      // Offline answer computation
      const computeOfflineText = () =>
        cachedGlossary ? cachedGlossary.offlineAnswer(clean, ctx, lang) : '';

      // If AI is not available (not selected, unscanned, not configured, or off)
      if (!currentProjectId || !isScanned || !isConfigured || !isAiOn) {
        const offText = computeOfflineText();
        let reason = '';
        if (!hasProject) {
          reason =
            lang === 'hi'
              ? 'Koi project select nahi hai. Offline help neeche hai.'
              : 'No project selected. Offline help is shown below.';
        } else if (!isScanned) {
          reason =
            lang === 'hi'
              ? 'Project scan nahi hua hai. AI ke liye pehle scan karein. Offline help neeche hai.'
              : 'Project is not scanned yet. Scan first to enable AI. Offline help is shown below.';
        } else if (!isConfigured) {
          reason = chatErrorMessage('AI_NOT_CONFIGURED', lang);
        } else if (!isAiOn) {
          reason = chatErrorMessage('AI_DISABLED', lang);
        }

        const fullOfflineText = reason ? `${offText}\n\n${reason}` : offText;

        const offMsg: ChatMessage = {
          id: uniqueMsgId('offline'),
          role: 'assistant',
          text: fullOfflineText,
          type: 'offline',
        };

        setMessages((prev) => [...prev, userMsg, offMsg]);
        return;
      }

      // AI IS configured, enabled, and project is selected & scanned
      const offlineMsg: ChatMessage | null = hasMatch
        ? {
            id: uniqueMsgId('offline'),
            role: 'assistant',
            text: computeOfflineText(),
            type: 'offline',
          }
        : null;

      const thinkingId = uniqueMsgId('think');
      const thinkingMsg: ChatMessage = {
        id: thinkingId,
        role: 'assistant',
        text: 'Ripple AI is thinking...',
        type: 'thinking',
        isThinking: true,
      };

      // Add messages immediately: user message + immediate offline answer (if match) + thinking indicator
      setMessages((prev) => [
        ...prev,
        userMsg,
        ...(offlineMsg ? [offlineMsg] : []),
        thinkingMsg,
      ]);

      setBusy(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let timedOut25 = false;
      const timer12 = setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === thinkingId
              ? {
                  ...m,
                  text:
                    lang === 'hi'
                      ? 'Thoda zyada waqt lag raha hai. Offline help upar hai.'
                      : 'Taking longer than usual. Offline help is shown above',
                }
              : m
          )
        );
      }, 12000);

      const timer25 = setTimeout(() => {
        timedOut25 = true;
        controller.abort('AI_TIMEOUT');
      }, 25000);

      // Prepare history: at most last 6 turns, each cut at 1000 chars
      const historySource = [...messages, userMsg]
        .filter((m) => m.type === 'user' || m.type === 'ai')
        .map((m) => ({ role: m.role, text: m.text }));
      const history = trimHistory(historySource);

      try {
        const res = await postChatMessage(
          currentProjectId,
          {
            message: clean.slice(0, 1500),
            screen: ctx.screen,
            lang,
            history,
            finding_id: ctx.finding_id,
            node_id: ctx.node_id,
            fix_id: ctx.fix_id,
            report_id: ctx.report_id,
          },
          controller.signal
        );

        clearTimeout(timer12);
        clearTimeout(timer25);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === thinkingId
              ? {
                  id: thinkingId,
                  role: 'assistant',
                  text: res.text,
                  type: 'ai',
                  source: res.source,
                  provider: res.provider,
                  model: res.model,
                }
              : m
          )
        );
      } catch (err: any) {
        clearTimeout(timer12);
        clearTimeout(timer25);

        let errorText = '';
        let canRetry = true;

        if (
          timedOut25 ||
          (controller.signal.aborted && controller.signal.reason === 'AI_TIMEOUT')
        ) {
          errorText = chatErrorMessage('AI_TIMEOUT', lang);
        } else if (controller.signal.aborted) {
          errorText = 'Request cancelled';
          canRetry = false;
        } else {
          const raw = err?.code || err?.message || '';
          errorText = chatErrorMessage(raw, lang);
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === thinkingId
              ? {
                  id: thinkingId,
                  role: 'assistant',
                  text: errorText,
                  type: 'error',
                  canRetry,
                }
              : m
          )
        );
      } finally {
        setBusy(false);
        abortControllerRef.current = null;
      }
    },
    [
      busy,
      location.pathname,
      location.search,
      lang,
      aiStatus,
      aiSettings,
      selectedProject,
      selectedProjectId,
      messages,
    ]
  );

  const retryLastMessage = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      sendMessage(lastUser.text);
    }
  }, [messages, sendMessage]);

  const value = useMemo<ChatContextValue>(
    () => ({
      isOpen,
      setIsOpen,
      toggleOpen,
      messages,
      busy,
      lang,
      setLang,
      aiStatus,
      aiSettings,
      statusLoading,
      settingsLoading,
      sendMessage,
      stopRequest,
      retryLastMessage,
      clearMessages,
      refreshSettings,
      updateSettings,
    }),
    [
      isOpen,
      toggleOpen,
      messages,
      busy,
      lang,
      setLang,
      aiStatus,
      aiSettings,
      statusLoading,
      settingsLoading,
      sendMessage,
      stopRequest,
      retryLastMessage,
      clearMessages,
      refreshSettings,
      updateSettings,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return ctx;
}
