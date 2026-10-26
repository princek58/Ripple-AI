/**
 * trimHistory – keeps at most the last 6 turns, each text cut at 1000 chars.
 * Pure function, no React.
 */
import type { HistoryEntry } from './types.js';

const MAX_TURNS = 6;
const MAX_TEXT_LEN = 1000;

/**
 * Returns at most the last 6 history entries, each with text truncated
 * to 1000 characters. Returns a new array; does not mutate the input.
 */
export function trimHistory(messages: HistoryEntry[]): HistoryEntry[] {
  const recent = messages.slice(-MAX_TURNS);
  return recent.map((m) => ({
    role: m.role,
    text: m.text.length > MAX_TEXT_LEN ? m.text.slice(0, MAX_TEXT_LEN) : m.text,
  }));
}
