/** Shared types for the chat feature (pure – no React imports). */

export type ChatScreen =
  | 'overview'
  | 'projects'
  | 'graph'
  | 'investigations'
  | 'fixes'
  | 'tests'
  | 'reports'
  | 'landing'
  | 'general';

export type ChatLang = 'en' | 'hi';

export interface ContextIds {
  screen: ChatScreen;
  finding_id?: string;
  node_id?: string;
  fix_id?: string;
  report_id?: string;
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  text: string;
}

/** AI status shape returned by GET /api/ai/status */
export interface AiStatusData {
  configured: boolean;
  provider: string | null;
  model: string | null;
}

/** Project AI settings shape returned by GET /api/projects/:id/ai-settings */
export interface ProjectAiSettings {
  ai_enabled: boolean;
  share_code: boolean;
  consent_version: string | null;
  current_consent_version: string;
  consent_text: string;
}

/** Chat success response data shape from POST /api/projects/:id/chat */
export interface ChatResponseData {
  text: string;
  source: string;   // "gemini" | "saved" | provider value
  provider: string;
  model: string;
}
