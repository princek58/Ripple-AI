export type AIProvider = 'gemini' | 'openai_compatible' | 'groq' | 'openai';

export interface AICandidate {
  provider: AIProvider;
  apiKey: string;
  model: string;
  apiBase: string;
  timeoutMs?: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  systemPrompt?: string;
  history?: AIMessage[];
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  text: string;
  provider: AIProvider;
  model: string;
}

export interface AIConfig {
  configured: boolean;
  provider: AIProvider;
  apiKey: string;
  model: string;
  fallbackModel?: string | null;
  apiBase: string;
  ratePerMinute: number;
  timeoutMs: number;
  maxOutputChars: number;
  candidates?: AICandidate[];
}

export interface AIAdapter {
  readonly provider: AIProvider;
  generate(request: AIRequest): Promise<AIResponse>;
  generateStream?(request: AIRequest): AsyncIterable<string>;
}

