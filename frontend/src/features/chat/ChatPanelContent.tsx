import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useChatSafe, registerChatModules } from './ChatProvider.js';
import { useProjects } from '../../lib/projectContext.js';
import { contextIdsFromUrl } from './urlHelpers.js';
import { ChatSettings } from './ChatSettings.js';
import * as glossary from './glossary.js';
import * as offlineAnswers from './offlineDataAnswers.js';
import * as offlineKeywords from './offlineKeywords.js';

registerChatModules({ glossary, offlineAnswers, offlineKeywords });

function getScreenExamples(screen: string, lang: 'en' | 'hi'): string[] {
  if (lang === 'hi') {
    switch (screen) {
      case 'graph':
        return [
          'circular dependency kya hai',
          'isolated file kya hoti hai',
          'graph levels kaise samajhein',
        ];
      case 'investigations':
        return [
          'broken import kaise theek karein',
          'severity aur confidence mein kya fark hai',
          'unresolved edge kya hota hai',
        ];
      case 'fixes':
        return [
          'fix proposed ka matlab kya hai',
          'patch verify kaise karein',
          'fix review kyun zaroori hai',
        ];
      case 'tests':
        return [
          'regression round kya hota hai',
          'test generation kaise kaam karta hai',
          'verified status ka kya matlab hai',
        ];
      case 'reports':
        return [
          'architecture report mein kya hota hai',
          'report export kaise karein',
          'ripple impact ka kya matlab hai',
        ];
      case 'overview':
      default:
        return [
          'circular dependency kya hai',
          'broken import kaise theek karein',
          'severity aur confidence mein kya fark hai',
        ];
    }
  }

  switch (screen) {
    case 'graph':
      return [
        'What is a circular dependency?',
        'What is an isolated file?',
        'How do I interpret graph levels?',
      ];
    case 'investigations':
      return [
        'How do I fix a broken import?',
        'What is the difference between severity and confidence?',
        'What is an unresolved edge?',
      ];
    case 'fixes':
      return [
        'What does fix proposed mean?',
        'How do I verify a patch?',
        'Why does a fix require review?',
      ];
    case 'tests':
      return [
        'What is a regression round?',
        'How does test generation work?',
        'What is verified status?',
      ];
    case 'reports':
      return [
        'What is included in the architecture report?',
        'How do I export this report?',
        'What does ripple impact mean?',
      ];
    case 'overview':
    default:
      return [
        'What is a circular dependency?',
        'How do I fix a broken import?',
        'What is the difference between severity and confidence?',
      ];
  }
}

export const ChatPanelContent: React.FC = () => {
  const chat = useChatSafe();
  if (!chat) return null;
  const {
    isOpen,
    setIsOpen,
    messages,
    busy,
    lang,
    setLang,
    aiStatus,
    aiSettings,
    sendMessage,
    stopRequest,
    retryLastMessage,
  } = chat;

  const { selectedProjectId } = useProjects();
  const location = useLocation();

  const [input, setInput] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const ctx = contextIdsFromUrl(location.pathname, location.search);
  const screenExamples = getScreenExamples(ctx.screen, lang);

  // Status badge
  let statusText = 'Offline help only';
  if (!selectedProjectId) {
    statusText = 'Offline help only';
  } else if (aiStatus?.configured === false) {
    statusText = 'AI not set up';
  } else if (!aiSettings?.ai_enabled) {
    statusText = 'AI off for this project';
  } else {
    statusText = 'AI on';
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, busy]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && !showSettings) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, showSettings]);

  const handleClose = () => {
    setIsOpen(false);
    const circle = document.getElementById('ripple-chat-circle');
    if (circle) circle.focus();
  };

  const handleSend = async () => {
    if (!input.trim() || busy) return;
    const textToSend = input;
    setInput('');
    await sendMessage(textToSend);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, text: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full w-full select-text">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border bg-theme-surface/90 backdrop-blur-sm flex-shrink-0">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-semibold text-sm text-theme-text">Ripple AI</h1>
            <span
              data-testid="chat-status-badge"
              className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-theme-surface-active text-theme-text border border-theme-border"
            >
              {statusText}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Language Toggle */}
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
            className="px-2 py-1 text-xs font-medium rounded text-theme-text-muted hover:text-theme-text hover:bg-theme-surface-active transition-colors"
            title="Toggle language"
            aria-label={`Language: ${lang === 'en' ? 'English' : 'Hinglish'}`}
          >
            {lang === 'en' ? 'HI' : 'EN'}
          </button>

          {/* Settings Toggle */}
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            className={`p-1.5 rounded text-theme-text-muted hover:text-theme-text hover:bg-theme-surface-active transition-colors ${
              showSettings ? 'bg-theme-surface-active text-theme-text' : ''
            }`}
            title="Chat settings"
            aria-label="Chat settings"
          >
            ⚙
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-sm rounded text-theme-text-muted hover:text-theme-text hover:bg-theme-surface-active transition-colors leading-none"
            aria-label="Close Ripple AI chat"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Content: Settings or Messages */}
      {showSettings ? (
        <ChatSettings onBack={() => setShowSettings(false)} />
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Message List */}
          <div
            role="log"
            aria-live="polite"
            className="flex-1 overflow-y-auto p-4 space-y-3"
            data-testid="chat-message-list"
          >
            {/* First-open Welcome Card */}
            {messages.length === 0 && (
              <div
                className="p-3.5 rounded-xl bg-theme-surface-active/60 border border-theme-border space-y-2.5"
                data-testid="chat-welcome-card"
              >
                <div className="text-xs font-semibold text-theme-text">
                  {lang === 'hi' ? 'Namaste! Main Ripple AI hoon.' : 'Hi! I am Ripple AI.'}
                </div>
                <p className="text-xs text-theme-text-muted leading-relaxed">
                  {lang === 'hi'
                    ? 'Architecture, dependencies ya findings ke baare mein poochhein. Offline help har waqt available hai.'
                    : 'Ask about your architecture, dependencies, or findings. Offline help is always available.'}
                </p>
                <div className="pt-1 space-y-1.5">
                  <div className="text-[11px] font-medium text-theme-text-muted">
                    {lang === 'hi' ? 'Udaharan sawaal:' : 'Try asking:'}
                  </div>
                  {screenExamples.map((example, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => sendMessage(example)}
                      className="block w-full text-left px-2.5 py-1.5 text-xs rounded-lg bg-theme-surface border border-theme-border text-theme-text hover:bg-theme-surface-active transition-colors truncate"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((m) => {
              if (m.role === 'user') {
                return (
                  <div
                    key={m.id}
                    className="flex justify-end"
                    data-testid="chat-user-message"
                  >
                    <div className="bg-theme-primary text-theme-surface rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[85%] text-xs whitespace-pre-wrap font-sans break-words shadow-sm">
                      {m.text}
                    </div>
                  </div>
                );
              }

              if (m.type === 'offline') {
                return (
                  <div
                    key={m.id}
                    className="flex flex-col gap-1 rounded-xl bg-theme-surface border border-theme-border p-3 text-xs"
                    data-testid="chat-offline-message"
                  >
                    <span className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                      Offline help
                    </span>
                    <div className="whitespace-pre-wrap font-sans text-theme-text break-words leading-relaxed">
                      {m.text}
                    </div>
                  </div>
                );
              }

              if (m.type === 'thinking') {
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 text-xs text-theme-text-muted italic p-2"
                    data-testid="chat-thinking-indicator"
                  >
                    <span className="inline-block animate-pulse">●</span>
                    <span className="whitespace-pre-wrap">{m.text}</span>
                  </div>
                );
              }

              if (m.type === 'error') {
                return (
                  <div
                    key={m.id}
                    className="flex flex-col gap-1.5 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-500"
                    data-testid="chat-error-message"
                  >
                    <div className="whitespace-pre-wrap font-sans break-words">{m.text}</div>
                    {m.canRetry && (
                      <button
                        type="button"
                        onClick={retryLastMessage}
                        className="self-start text-xs font-semibold text-theme-primary hover:underline mt-0.5"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                );
              }

              // Default: AI Message
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-1.5 rounded-xl bg-theme-surface border border-theme-border p-3 text-xs"
                  data-testid="chat-ai-message"
                >
                  <div className="flex items-center justify-between text-[10px] text-theme-text-muted pb-1 border-b border-theme-border">
                    <span className="truncate">
                      AI-written, may be wrong. Ripple has not verified it.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(m.id, m.text)}
                      className="ml-2 text-theme-primary hover:underline font-medium flex-shrink-0"
                      aria-label="Copy answer"
                    >
                      {copiedId === m.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap font-sans text-theme-text break-words leading-relaxed">
                    {m.text}
                  </div>
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Area */}
          <div className="p-3 border-t border-theme-border bg-theme-surface flex-shrink-0">
            <div className="relative rounded-xl border border-theme-border bg-theme-surface-active/30 focus-within:ring-1 focus-within:ring-theme-primary focus-within:border-theme-primary transition-all">
              <textarea
                ref={inputRef}
                data-testid="chat-input"
                value={input}
                maxLength={1500}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={
                  lang === 'hi'
                    ? 'Ripple AI se poochhein... (Enter bhejein, Shift+Enter nayi line)'
                    : 'Ask Ripple AI... (Enter to send, Shift+Enter for new line)'
                }
                rows={2}
                className="w-full bg-transparent px-3 pt-2.5 pb-7 text-xs text-theme-text placeholder-theme-text-muted focus:outline-none resize-none disabled:opacity-50"
              />

              <div className="absolute bottom-2 left-3 right-2 flex items-center justify-between">
                <span className="text-[10px] text-theme-text-muted">
                  {input.length}/1500
                </span>

                <div className="flex items-center gap-1.5">
                  {busy ? (
                    <button
                      type="button"
                      onClick={stopRequest}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                      aria-label="Stop request"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid="chat-send-btn"
                      disabled={!input.trim()}
                      onClick={handleSend}
                      className="px-3 py-1 text-xs font-medium rounded-lg bg-theme-primary text-theme-surface hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      aria-label="Send message"
                    >
                      Send
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPanelContent;
