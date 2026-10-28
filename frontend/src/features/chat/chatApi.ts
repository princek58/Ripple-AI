import { API_BASE_URL } from '../../lib/api.js';
import type {
  AiStatusData,
  ProjectAiSettings,
  ChatResponseData,
  StreamChunk,
  ContextIds,
  HistoryEntry,
  ChatLang,
} from './types.js';

export interface ChatRequestPayload {
  message: string;
  screen: ContextIds['screen'];
  lang?: ChatLang;
  history?: HistoryEntry[];
  finding_id?: string;
  node_id?: string;
  fix_id?: string;
  report_id?: string;
}

export async function fetchAiStatus(signal?: AbortSignal): Promise<AiStatusData> {
  const res = await fetch(`${API_BASE_URL}/api/ai/status`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch AI status: ${res.status}`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error);
  }
  return json.data;
}

export async function fetchProjectAiSettings(
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectAiSettings> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/ai-settings`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch AI settings: ${res.status}`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error);
  }
  return json.data;
}

export async function putProjectAiSettings(
  projectId: string,
  body: { ai_enabled: boolean; share_code?: boolean; consent_version?: string },
  signal?: AbortSignal
): Promise<ProjectAiSettings> {
  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/ai-settings`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    const errorMsg = json?.error || `Failed to update settings (${res.status})`;
    const err = new Error(errorMsg);
    (err as any).status = res.status;
    (err as any).code = json?.error;
    throw err;
  }
  return json.data;
}

export async function postChatMessage(
  projectId: string,
  payload: ChatRequestPayload,
  signal?: AbortSignal
): Promise<ChatResponseData> {
  // Construct body strictly with allowed keys:
  // message, screen, lang, history (if present), and context ids if present
  const body: Record<string, unknown> = {
    message: payload.message,
    screen: payload.screen,
  };
  if (payload.lang) {
    body.lang = payload.lang;
  }
  if (payload.history && payload.history.length > 0) {
    body.history = payload.history;
  }
  if (payload.finding_id) body.finding_id = payload.finding_id;
  if (payload.node_id) body.node_id = payload.node_id;
  if (payload.fix_id) body.fix_id = payload.fix_id;
  if (payload.report_id) body.report_id = payload.report_id;

  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/chat`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    const rawError = json?.error || `Request failed (${res.status})`;
    const err = new Error(rawError);
    (err as any).status = res.status;
    (err as any).code = rawError;
    throw err;
  }
  return json.data;
}

export async function streamChatMessage(
  projectId: string,
  payload: ChatRequestPayload & { stream?: boolean },
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal
): Promise<ChatResponseData> {
  const body: Record<string, unknown> = {
    message: payload.message,
    screen: payload.screen,
  };
  if (payload.stream) body.stream = payload.stream;
  if (payload.lang) body.lang = payload.lang;
  if (payload.history && payload.history.length > 0) body.history = payload.history;
  if (payload.finding_id) body.finding_id = payload.finding_id;
  if (payload.node_id) body.node_id = payload.node_id;
  if (payload.fix_id) body.fix_id = payload.fix_id;
  if (payload.report_id) body.report_id = payload.report_id;

  const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/chat`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream, application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const rawError = json?.error || `Request failed (${res.status})`;
    const err = new Error(rawError);
    (err as any).status = res.status;
    (err as any).code = rawError;
    throw err;
  }

  const contentType = res.headers?.get?.('content-type') || '';

  // Fallback if response is JSON instead of text/event-stream (e.g. non-streaming mock or direct response)
  if (!contentType.includes('text/event-stream') || !res.body?.getReader) {
    const json = await res.json().catch(() => null);
    if (!json || json.error) {
      throw new Error(json?.error || 'Empty response');
    }
    const data = json.data as ChatResponseData;
    onChunk({
      delta: data.text,
      text: data.text,
      done: true,
      provider: data.provider,
      model: data.model,
      source: data.source,
    });
    return data;
  }

  let fullText = '';
  let finalProvider = '';
  let finalModel = '';
  let finalSource = '';

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr) as StreamChunk;
          if (parsed.error) {
            const err = new Error(parsed.error);
            (err as any).code = parsed.error;
            throw err;
          }
          if (parsed.delta) {
            fullText += parsed.delta;
          } else if (parsed.text && !fullText) {
            fullText = parsed.text;
          }
          if (parsed.provider) finalProvider = parsed.provider;
          if (parsed.model) finalModel = parsed.model;
          if (parsed.source) finalSource = parsed.source;

          onChunk({
            ...parsed,
            text: fullText,
          });
        } catch (e: any) {
          if (e?.code || e?.message?.startsWith('AI_')) {
            throw e;
          }
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim() && buffer.trim().startsWith('data:')) {
      const dataStr = buffer.trim().slice(5).trim();
      if (dataStr && dataStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr) as StreamChunk;
          if (parsed.delta) fullText += parsed.delta;
          else if (parsed.text && !fullText) fullText = parsed.text;
          if (parsed.provider) finalProvider = parsed.provider;
          if (parsed.model) finalModel = parsed.model;
          if (parsed.source) finalSource = parsed.source;

          onChunk({
            ...parsed,
            text: fullText,
          });
        } catch {}
      }
    }
  } finally {
    try {
      reader.releaseLock?.();
    } catch {}
  }

  return {
    text: fullText,
    provider: finalProvider || 'gemini',
    model: finalModel || 'gemini-1.5-flash',
    source: finalSource || 'ai',
  };
}

export interface ChatHistoryMessage {
  id: string;
  project_id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: string | null;
  model: string | null;
  created_at: string;
}

export async function fetchChatHistory(
  projectId: string,
  signal?: AbortSignal
): Promise<ChatHistoryMessage[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/chat/history`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res || !res.ok) return [];
    const json = await res.json().catch(() => null);
    if (!json || json.error || !json.data || !Array.isArray(json.data.items)) return [];
    return json.data.items;
  } catch {
    return [];
  }
}

export async function deleteChatHistory(
  projectId: string,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/chat/history`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res || !res.ok) return false;
    const json = await res.json().catch(() => null);
    return Boolean(json?.data?.cleared);
  } catch {
    return false;
  }
}

