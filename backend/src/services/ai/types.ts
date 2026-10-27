export type AIProvider = 'gemini' | 'openai_compatible';

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
}

export interface AIAdapter {
  readonly provider: AIProvider;
  generate(request: AIRequest): Promise<AIResponse>;
}
