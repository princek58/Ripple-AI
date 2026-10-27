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
  fetchChatHistory,
  deleteChatHistory,
} from './chatApi.js';
import type {
  AiStatusData,
  ProjectAiSettings,
  ChatLang,
} from './types.js';

let chatModules: {
  glossary?: {
    offlineAnswer: (question: string, context?: any, lang?: any) => string;
    hasGlossaryMatch: (question: string) => boolean;
  };
  offlineAnswers?: typeof import('./offlineDataAnswers.js');
  offlineKeywords?: typeof import('./offlineKeywords.js');
} | null = null;

export function registerChatModules(mods: {
  glossary: {
    offlineAnswer: (question: string, context?: any, lang?: any) => string;
    hasGlossaryMatch: (question: string) => boolean;
  };
  offlineAnswers: typeof import('./offlineDataAnswers.js');
  offlineKeywords: typeof import('./offlineKeywords.js');
}) {
  chatModules = mods;
}

export function setCachedGlossary(m: {
  offlineAnswer: (question: string, context?: any, lang?: any) => string;
  hasGlossaryMatch: (question: string) => boolean;
}) {
  if (!chatModules) {
    chatModules = { glossary: m };
  } else {
    chatModules.glossary = m;
  }
}

export async function loadGlossarySyncOrAsync(): Promise<void> {
  if (
    chatModules?.glossary &&
    chatModules?.offlineAnswers &&
    chatModules?.offlineKeywords
  ) {
    return;
  }
  const [glossary, offlineAnswers, offlineKeywords] = await Promise.all([
    import('./glossary.js'),
    import('./offlineDataAnswers.js'),
    import('./offlineKeywords.js'),
  ]);
  chatModules = {
    glossary,
    offlineAnswers,
    offlineKeywords,
  };
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
  clearChat: () => Promise<void>;
  isMinimized: boolean;
  setIsMinimized: (minimized: boolean) => void;
  toggleMinimized: () => void;
  panelCoords: { x: number; y: number } | null;
  setPanelCoords: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  resetPosition: () => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  refreshSettings: () => Promise<void>;
  updateSettings: (body: {
    ai_enabled: boolean;
    share_code?: boolean;
    consent_version?: string;
  }) => Promise<ProjectAiSettings | void>;
  pendingQuestion?: string | null;
  enableAiWithConsent?: () => Promise<void>;
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
  const aiSettingsRef = useRef<ProjectAiSettings | null>(aiSettings);
  useEffect(() => {
    aiSettingsRef.current = aiSettings;
  }, [aiSettings]);

  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const pendingQuestionRef = useRef<string | null>(null);
  useEffect(() => {
    pendingQuestionRef.current = pendingQuestion;
  }, [pendingQuestion]);

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

  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const toggleMinimized = useCallback(() => setIsMinimized((prev) => !prev), []);
  const [panelCoords, setPanelCoords] = useState<{ x: number; y: number } | null>(null);
  const resetPosition = useCallback(() => setPanelCoords(null), []);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const clearChat = useCallback(async () => {
    setMessages([]);
    if (selectedProjectId) {
      try {
        await deleteChatHistory(selectedProjectId);
      } catch {}
    }
  }, [selectedProjectId]);

  const clearMessages = useCallback(() => {
    clearChat();
  }, [clearChat]);

  // Fetch persistent chat history for selected project
  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }

    const abortController = new AbortController();
    let isCancelled = false;

    fetchChatHistory(selectedProjectId, abortController.signal)
      .then((historyItems) => {
        if (isCancelled || !Array.isArray(historyItems) || historyItems.length === 0) {
          return;
        }

        const loaded: ChatMessage[] = historyItems.map((item) => ({
          id: item.id || uniqueMsgId('history'),
          role: item.role,
          text: item.content,
          type: item.role === 'user' ? 'user' : 'ai',
          provider: item.provider || undefined,
          model: item.model || undefined,
        }));

        setMessages((current) => {
          if (current.length === 0) {
            return loaded;
          }
          const existingIds = new Set(current.map((m) => m.id));
          const toPrepend = loaded.filter((m) => !existingIds.has(m.id));
          return [...toPrepend, ...current];
        });
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [selectedProjectId]);

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

  // Abort in-flight requests when panel closes
  useEffect(() => {
    if (!isOpen && abortControllerRef.current) {
      abortControllerRef.current.abort('PANEL_CLOSED');
      abortControllerRef.current = null;
      setBusy(false);
    }
  }, [isOpen]);

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
      aiSettingsRef.current = updated;
      setAiSettings(updated);
      return updated;
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

      if (!chatModules?.glossary || !chatModules?.offlineAnswers || !chatModules?.offlineKeywords) {
        await loadGlossarySyncOrAsync();
      }

      // Check if question matches offline data questions
      const offlineDataType = chatModules?.offlineKeywords?.matchOfflineDataQuestion(
        clean,
        Boolean(ctx.finding_id)
      );
      const activeAnswers = chatModules?.offlineAnswers;

      const currentSettings = aiSettingsRef.current || aiSettings;
      const isConfigured = aiStatus?.configured === true;
      const isAiOn = currentSettings ? currentSettings.ai_enabled === true : true;
      const isScanned = Boolean(selectedProject?.last_scan_at);
      const currentProjectId = selectedProjectId;
      const hasProject = Boolean(currentProjectId);

      const canUseAi = hasProject && isScanned && isConfigured && isAiOn;

      // When AI is off, not configured or project not scanned: offline answers only
      if (!canUseAi) {
        pendingQuestionRef.current = clean;
        setPendingQuestion(clean);

        let offText = '';
        if (offlineDataType && activeAnswers && isScanned && currentProjectId) {
          try {
            offText = await activeAnswers.getOfflineDataAnswer(
              offlineDataType,
              {
                projectId: currentProjectId,
                isScanned,
                lang,
                screen: ctx.screen,
                findingId: ctx.finding_id,
              }
            );
          } catch {
            offText = chatModules?.glossary ? chatModules.glossary.offlineAnswer(clean, ctx, lang) : '';
          }
        } else if (offlineDataType && activeAnswers && !isScanned && currentProjectId) {
          offText = activeAnswers.formatNeverScanned() || 'Not scanned yet.';
        } else {
          offText = chatModules?.glossary ? chatModules.glossary.offlineAnswer(clean, ctx, lang) : '';
        }

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

        const fullOfflineText = reason ? (offText ? `${offText}\n\n${reason}` : reason) : offText;

        const offMsg: ChatMessage = {
          id: uniqueMsgId('offline'),
          role: 'assistant',
          text: fullOfflineText,
          type: 'offline',
        };

        setMessages((prev) => [...prev, userMsg, offMsg]);
        return;
      }

      // AI-first flow: when AI is on and configured, send every user message to chat route
      // and show only the "Ripple AI is thinking..." indicator (do NOT show an offline box first)
      const thinkingId = uniqueMsgId('think');
      const thinkingMsg: ChatMessage = {
        id: thinkingId,
        role: 'assistant',
        text: 'Ripple AI is thinking...',
        type: 'thinking',
        isThinking: true,
      };

      setMessages((prev) => [...prev, userMsg, thinkingMsg]);
      setBusy(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let timedOut40 = false;
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

      const timer40 = setTimeout(() => {
        timedOut40 = true;
        controller.abort('AI_TIMEOUT');
      }, 40000);

      // Prepare history: at most last 6 turns, each cut at 1000 chars
      const historySource = [...messages, userMsg]
        .filter((m) => m.type === 'user' || m.type === 'ai')
        .map((m) => ({ role: m.role, text: m.text }));
      const history = trimHistory(historySource);

      try {
        const res = await postChatMessage(
          currentProjectId!,
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
        clearTimeout(timer40);

        // Success: replace thinkingMsg with AI answer
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
        clearTimeout(timer40);

        let errorText = '';
        let canRetry = true;
        const isUserCancelled =
          controller.signal.aborted &&
          !timedOut40 &&
          controller.signal.reason !== 'AI_TIMEOUT';

        if (
          timedOut40 ||
          (controller.signal.aborted && controller.signal.reason === 'AI_TIMEOUT')
        ) {
          errorText = chatErrorMessage('AI_TIMEOUT', lang);
        } else if (isUserCancelled) {
          errorText = 'Request cancelled';
          canRetry = false;
        } else {
          const raw = err?.code || err?.message || '';
          errorText = chatErrorMessage(raw, lang);
        }

        if (isUserCancelled) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === thinkingId
                ? {
                    id: thinkingId,
                    role: 'assistant',
                    text: errorText,
                    type: 'error',
                    canRetry: false,
                  }
                : m
            )
          );
        } else {
          // When AI fails or times out: ONLY show friendly error banner + Retry button
          // and only show offline answer if question actually matched a real glossary term or data query
          const hasRealMatch = Boolean(
            offlineDataType || (chatModules?.glossary && chatModules.glossary.hasGlossaryMatch(clean))
          );

          let offText = '';
          if (hasRealMatch) {
            try {
              if (offlineDataType && activeAnswers && isScanned && currentProjectId) {
                offText = await activeAnswers.getOfflineDataAnswer(
                  offlineDataType,
                  {
                    projectId: currentProjectId,
                    isScanned,
                    lang,
                    screen: ctx.screen,
                    findingId: ctx.finding_id,
                  }
                );
              } else if (chatModules?.glossary && chatModules.glossary.hasGlossaryMatch(clean)) {
                offText = chatModules.glossary.offlineAnswer(clean, ctx, lang);
              }
            } catch {}
          }

          const errorMsg: ChatMessage = {
            id: thinkingId,
            role: 'assistant',
            text: errorText,
            type: 'error',
            canRetry,
          };

          const offMsg: ChatMessage | null = offText
            ? {
                id: uniqueMsgId('offline'),
                role: 'assistant',
                text: offText,
                type: 'offline',
              }
            : null;

          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === thinkingId);
            if (idx === -1) {
              return offMsg ? [...prev, offMsg, errorMsg] : [...prev, errorMsg];
            }
            const next = [...prev];
            if (offMsg) {
              next.splice(idx, 1, offMsg, errorMsg);
            } else {
              next.splice(idx, 1, errorMsg);
            }
            return next;
          });
        }
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

  const enableAiWithConsent = useCallback(async () => {
    if (!selectedProjectId) return;
    const currentVer =
      aiSettingsRef.current?.current_consent_version ||
      aiSettings?.current_consent_version ||
      '2026-10-v2';

    await updateSettings({
      ai_enabled: true,
      share_code: false,
      consent_version: currentVer,
    });

    if (pendingQuestionRef.current) {
      const q = pendingQuestionRef.current;
      pendingQuestionRef.current = null;
      setPendingQuestion(null);
      await sendMessage(q);
    }
  }, [selectedProjectId, aiSettings, updateSettings, sendMessage]);

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
      clearChat,
      isMinimized,
      setIsMinimized,
      toggleMinimized,
      panelCoords,
      setPanelCoords,
      resetPosition,
      isDragging,
      setIsDragging,
      refreshSettings,
      updateSettings,
      pendingQuestion,
      enableAiWithConsent,
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
      clearChat,
      isMinimized,
      setIsMinimized,
      toggleMinimized,
      panelCoords,
      setPanelCoords,
      resetPosition,
      isDragging,
      setIsDragging,
      refreshSettings,
      updateSettings,
      pendingQuestion,
      enableAiWithConsent,
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
