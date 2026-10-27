/**
 * chatErrorMessage – maps backend AI error codes to friendly UI text.
 * Pure function, no React. Never shows raw server text.
 *
 * Error codes (from RIPPLE_AI_MASTER_SPEC.md §5 and captured fixtures):
 *   AI_DISABLED           403
 *   AI_NOT_CONFIGURED     503
 *   AI_RATE_LIMITED       429 (with Retry-After)
 *   AI_QUOTA_EXHAUSTED    429
 *   AI_REQUEST_REJECTED   upstream 400/401/403
 *   AI_AUTH_FAILED        upstream auth failure
 *   AI_MODEL_NOT_FOUND    upstream 404
 *   AI_UNAVAILABLE        upstream 5xx
 *   AI_UNREACHABLE        network / connection refused
 *   AI_NO_ANSWER          empty response / safety blocked
 *   AI_TIMEOUT            request timeout
 *   AI_CONSENT_REQUIRED   missing/wrong consent
 */
import type { ChatLang } from './types.js';

const messages: Record<string, Record<ChatLang, string>> = {
  AI_DISABLED: {
    en: 'AI is off for this project. Turn it on in the chat settings, or use the offline help.',
    hi: 'Is project ke liye AI band hai. Chat settings mein on karo, ya offline help use karo.',
  },
  AI_NOT_CONFIGURED: {
    en: 'The AI service is not set up on this server. Offline help is shown below.',
    hi: 'Is server par AI service configure nahi hai. Neeche offline help dekho.',
  },
  AI_RATE_LIMITED: {
    en: 'Too many requests right now. Please wait a moment and try again. Offline help is shown below.',
    hi: 'Abhi bahut zyada requests aa rahi hain. Thodi der ruko aur dobara koshish karo. Offline help neeche hai.',
  },
  AI_QUOTA_EXHAUSTED: {
    en: 'The AI service has reached its free limit. Offline help still works.',
    hi: 'AI service ki free limit khatam ho gayi hai. Offline help abhi bhi kaam karta hai.',
  },
  AI_REQUEST_REJECTED: {
    en: 'The AI service rejected the request. Offline help is shown below.',
    hi: 'AI service ne request reject kar di. Offline help neeche hai.',
  },
  AI_AUTH_FAILED: {
    en: 'The AI service could not authenticate. Please contact the administrator. Offline help is shown below.',
    hi: 'AI service authenticate nahi ho payi. Admin se baat karo. Offline help neeche hai.',
  },
  AI_MODEL_NOT_FOUND: {
    en: 'The AI model is not available right now. Offline help is shown below.',
    hi: 'AI model abhi available nahi hai. Offline help neeche hai.',
  },
  AI_UNAVAILABLE: {
    en: 'The AI service is slow or busy right now. Offline help is shown below.',
    hi: 'AI service abhi slow ya busy hai. Offline help neeche hai.',
  },
  AI_UNREACHABLE: {
    en: 'Cannot reach the AI service. Check your connection. Offline help is shown below.',
    hi: 'AI service tak pahunch nahi pa rahe. Connection check karo. Offline help neeche hai.',
  },
  AI_NO_ANSWER: {
    en: 'The AI did not produce an answer this time. Offline help is shown below.',
    hi: 'AI ne is baar koi jawab nahi diya. Offline help neeche hai.',
  },
  AI_TIMEOUT: {
    en: 'The AI service is slow or busy right now. Offline help is shown below.',
    hi: 'AI service abhi slow ya busy hai. Offline help neeche hai.',
  },
  AI_CONSENT_REQUIRED: {
    en: 'Consent is required to enable AI. Read the consent text in chat settings and confirm.',
    hi: 'AI enable karne ke liye consent zaroori hai. Chat settings mein consent text padho aur confirm karo.',
  },
};

const DEFAULT_MESSAGE: Record<ChatLang, string> = {
  en: 'Something went wrong with the AI service. Offline help is shown below.',
  hi: 'AI service mein kuch gadbad hui. Offline help neeche hai.',
};

/**
 * Returns a friendly, never-raw message for the given AI error code.
 * Falls back to a safe default for unknown codes.
 */
export function chatErrorMessage(code: string, lang: ChatLang = 'en'): string {
  if (code.includes('CONSENT_OUTDATED')) {
    return lang === 'hi'
      ? 'AI privacy note update ho gaya hai. AI use karne ke liye ise dobara accept karein.'
      : 'The AI privacy note was updated. Please accept it again to use AI.';
  }
  // Strip any bracketed reason suffix: "AI_DISABLED [CONSENT_REQUIRED]" → "AI_DISABLED"
  const baseCode = code.split(' ')[0].trim();
  const entry = messages[baseCode];
  if (entry) return entry[lang] ?? entry.en;
  return DEFAULT_MESSAGE[lang] ?? DEFAULT_MESSAGE.en;
}
