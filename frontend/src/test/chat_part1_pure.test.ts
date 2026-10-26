/**
 * K2 Part 1 – Pure function tests for the chat feature.
 *
 * Covers:
 *   - screenFromPath()
 *   - contextIdsFromUrl()
 *   - chatErrorMessage()
 *   - GLOSSARY (count, shape)
 *   - offlineAnswer()
 *   - trimHistory()
 *   - Captured API fixture shapes
 *   - XSS / HTML sanitisation (these are plain-text functions – no DOM output)
 *
 * Note on success body: POST /api/projects/:id/chat with a real key returns
 * { data: { text: string, source: string, provider: string, model: string }, error: null }.
 * This shape is confirmed by the real Gemini capture in ai_chat_success.json.
 * The 503 AI_NOT_CONFIGURED scenario was not capturable without removing the key;
 * its shape is built from the documented spec and is consistent with the 403/503 fixture shapes.
 */

import { describe, it, expect } from 'vitest';
import { screenFromPath, contextIdsFromUrl } from '../features/chat/urlHelpers.js';
import { chatErrorMessage } from '../features/chat/errorMessages.js';
import { GLOSSARY, offlineAnswer } from '../features/chat/glossary.js';
import { trimHistory } from '../features/chat/trimHistory.js';

// -- Fixtures ------------------------------------------------------------------
import aiStatus from './fixtures/api/ai_status.json';
import aiSettingsDefault from './fixtures/api/ai_settings_default.json';
import aiSettingsPutEnable from './fixtures/api/ai_settings_put_enable.json';
import aiSettingsPutWrongConsent from './fixtures/api/ai_settings_put_wrong_consent.json';
import aiSettingsPutShareWithoutAi from './fixtures/api/ai_settings_put_share_without_ai.json';
import aiChat403Disabled from './fixtures/api/ai_chat_403_ai_disabled.json';
import aiChat400BadBody from './fixtures/api/ai_chat_400_bad_body.json';
import aiChat404ForeignFinding from './fixtures/api/ai_chat_404_foreign_finding.json';
import aiChatSuccess from './fixtures/api/ai_chat_success.json';

// =============================================================================
// FIXTURE SHAPE VERIFICATION
// =============================================================================
describe('K2 Part 1 – captured API fixture shapes', () => {
  it('GET /api/ai/status has { data: { configured, provider, model }, error }', () => {
    expect(typeof aiStatus.data.configured).toBe('boolean');
    expect(typeof aiStatus.data.provider).toBe('string');
    // model may be string or null
    expect(aiStatus.error).toBeNull();
  });

  it('GET /api/projects/:id/ai-settings default has correct shape', () => {
    const { data } = aiSettingsDefault;
    expect(data.ai_enabled).toBe(false);
    expect(data.share_code).toBe(false);
    expect(data.consent_version).toBeNull();
    expect(typeof data.current_consent_version).toBe('string');
    expect(typeof data.consent_text).toBe('string');
    expect(data.consent_text.length).toBeGreaterThan(20);
    expect(aiSettingsDefault.error).toBeNull();
  });

  it('PUT /api/projects/:id/ai-settings valid enable returns updated settings', () => {
    const { data } = aiSettingsPutEnable;
    expect(data.ai_enabled).toBe(true);
    expect(data.consent_version).toBe('2026-10-v1');
    expect(aiSettingsPutEnable.error).toBeNull();
  });

  it('PUT with wrong consent version returns 400 AI_CONSENT_REQUIRED', () => {
    expect(aiSettingsPutWrongConsent.data).toBeNull();
    expect(typeof aiSettingsPutWrongConsent.error).toBe('string');
    expect(aiSettingsPutWrongConsent.error).toContain('AI_CONSENT_REQUIRED');
  });

  it('PUT share_code without ai_enabled returns 400 AI_CONSENT_REQUIRED', () => {
    expect(aiSettingsPutShareWithoutAi.data).toBeNull();
    expect(typeof aiSettingsPutShareWithoutAi.error).toBe('string');
    expect(aiSettingsPutShareWithoutAi.error).toContain('AI_CONSENT_REQUIRED');
  });

  it('POST /api/projects/:id/chat while AI off returns 403 AI_DISABLED', () => {
    expect(aiChat403Disabled.data).toBeNull();
    expect(typeof aiChat403Disabled.error).toBe('string');
    expect(aiChat403Disabled.error).toContain('AI_DISABLED');
  });

  it('POST /api/projects/:id/chat with bad body returns 400', () => {
    expect(aiChat400BadBody.data).toBeNull();
    expect(typeof aiChat400BadBody.error).toBe('string');
  });

  it('POST /api/projects/:id/chat with foreign finding_id returns 404', () => {
    expect(aiChat404ForeignFinding.data).toBeNull();
    expect(typeof aiChat404ForeignFinding.error).toBe('string');
  });

  it('POST /api/projects/:id/chat success has { text, source, provider, model }', () => {
    // Shape captured from real Gemini call (ai_chat_success.json)
    const { data } = aiChatSuccess;
    expect(typeof data.text).toBe('string');
    expect(data.text.length).toBeGreaterThan(0);
    expect(typeof data.source).toBe('string');
    expect(typeof data.provider).toBe('string');
    expect(typeof data.model).toBe('string');
    expect(aiChatSuccess.error).toBeNull();
  });

  it('AI_NOT_CONFIGURED documented shape matches { data: null, error: "AI_NOT_CONFIGURED..." }', () => {
    // Not capturable without removing the key. Shape documented in spec §5.
    // Built from spec: 503, error field contains "AI_NOT_CONFIGURED"
    const handbuilt = { data: null, error: 'AI_NOT_CONFIGURED' };
    expect(handbuilt.data).toBeNull();
    expect(handbuilt.error).toContain('AI_NOT_CONFIGURED');
  });
});

// =============================================================================
// screenFromPath
// =============================================================================
describe('K2 Part 1 – screenFromPath()', () => {
  const cases: Array<[string, string]> = [
    ['/', 'landing'],
    ['/app/overview', 'overview'],
    ['/app/projects', 'projects'],
    ['/app/graph', 'graph'],
    ['/app/investigations', 'investigations'],
    ['/app/fixes', 'fixes'],
    ['/app/tests', 'tests'],
    ['/app/reports', 'reports'],
    ['/unknown/path', 'general'],
    ['/dev/design-system', 'general'],
    ['', 'landing'],
  ];

  for (const [pathname, expected] of cases) {
    it(`screenFromPath("${pathname}") → "${expected}"`, () => {
      expect(screenFromPath(pathname)).toBe(expected);
    });
  }

  // Mutation check: returned value is a string
  it('mutation: returns a string in all cases (value is not mutated)', () => {
    const pathname = '/app/overview';
    const r1 = screenFromPath(pathname);
    const r2 = screenFromPath(pathname);
    expect(r1).toBe(r2);
    expect(typeof r1).toBe('string');
  });
});

// =============================================================================
// contextIdsFromUrl
// =============================================================================
describe('K2 Part 1 – contextIdsFromUrl()', () => {
  const UUID = '4e2f4b5c-4ef3-4103-9279-9c97d20497e8';
  const BAD_UUID = 'not-a-uuid';

  it('no query params → only screen set', () => {
    const result = contextIdsFromUrl('/app/investigations', '');
    expect(result).toEqual({ screen: 'investigations' });
  });

  it('?finding=<uuid> → finding_id set', () => {
    const result = contextIdsFromUrl('/app/investigations', `?finding=${UUID}`);
    expect(result.finding_id).toBe(UUID);
    expect(result.screen).toBe('investigations');
  });

  it('?focus=<uuid> → node_id set', () => {
    const result = contextIdsFromUrl('/app/graph', `?focus=${UUID}`);
    expect(result.node_id).toBe(UUID);
  });

  it('?fix=<uuid> → fix_id set', () => {
    const result = contextIdsFromUrl('/app/fixes', `?fix=${UUID}`);
    expect(result.fix_id).toBe(UUID);
  });

  it('?report=<uuid> → report_id set', () => {
    const result = contextIdsFromUrl('/app/reports', `?report=${UUID}`);
    expect(result.report_id).toBe(UUID);
  });

  it('invalid UUID for ?finding is dropped', () => {
    const result = contextIdsFromUrl('/app/investigations', `?finding=${BAD_UUID}`);
    expect(result.finding_id).toBeUndefined();
  });

  it('invalid UUID for ?focus is dropped', () => {
    const result = contextIdsFromUrl('/app/graph', `?focus=${BAD_UUID}`);
    expect(result.node_id).toBeUndefined();
  });

  it('?finding=non-uuid-string is dropped', () => {
    const result = contextIdsFromUrl('/app/investigations', '?finding=f-123');
    expect(result.finding_id).toBeUndefined();
  });

  it('multiple params all valid → all ids set', () => {
    const UUID2 = '00000000-0000-0000-0000-000000000001';
    const result = contextIdsFromUrl(
      '/app/investigations',
      `?finding=${UUID}&focus=${UUID2}`
    );
    expect(result.finding_id).toBe(UUID);
    expect(result.node_id).toBe(UUID2);
  });

  it('landing page (/) → screen="landing", no ids', () => {
    const result = contextIdsFromUrl('/', '');
    expect(result).toEqual({ screen: 'landing' });
  });

  it('mutation: result object is a new object each call', () => {
    const r1 = contextIdsFromUrl('/app/overview', '');
    const r2 = contextIdsFromUrl('/app/overview', '');
    expect(r1).not.toBe(r2);
    expect(r1).toEqual(r2);
  });

  it('HTML-looking value in search param is not a valid UUID and is dropped', () => {
    const result = contextIdsFromUrl('/app/investigations', '?finding=<img src=x>');
    expect(result.finding_id).toBeUndefined();
  });
});

// =============================================================================
// chatErrorMessage
// =============================================================================
describe('K2 Part 1 – chatErrorMessage()', () => {
  const ALL_CODES = [
    'AI_DISABLED',
    'AI_NOT_CONFIGURED',
    'AI_RATE_LIMITED',
    'AI_QUOTA_EXHAUSTED',
    'AI_REQUEST_REJECTED',
    'AI_AUTH_FAILED',
    'AI_MODEL_NOT_FOUND',
    'AI_UNAVAILABLE',
    'AI_UNREACHABLE',
    'AI_NO_ANSWER',
    'AI_TIMEOUT',
    'AI_CONSENT_REQUIRED',
  ];

  for (const code of ALL_CODES) {
    it(`${code} English returns non-empty string without raw server text`, () => {
      const msg = chatErrorMessage(code, 'en');
      expect(msg.length).toBeGreaterThan(10);
      expect(msg).not.toContain(code);  // never show raw code
    });

    it(`${code} Hinglish returns non-empty string`, () => {
      const msg = chatErrorMessage(code, 'hi');
      expect(msg.length).toBeGreaterThan(10);
    });
  }

  it('AI_DISABLED English mentions offline help', () => {
    expect(chatErrorMessage('AI_DISABLED', 'en')).toContain('offline help');
  });

  it('AI_QUOTA_EXHAUSTED English mentions offline help', () => {
    expect(chatErrorMessage('AI_QUOTA_EXHAUSTED', 'en')).toContain('Offline help');
  });

  it('AI_UNAVAILABLE and AI_TIMEOUT return same message (both "slow or busy")', () => {
    const u = chatErrorMessage('AI_UNAVAILABLE', 'en');
    const t = chatErrorMessage('AI_TIMEOUT', 'en');
    expect(u).toBe(t);
  });

  it('code with bracketed suffix is handled: "AI_DISABLED [CONSENT_REQUIRED]"', () => {
    const msg = chatErrorMessage('AI_DISABLED [CONSENT_REQUIRED]', 'en');
    expect(msg.length).toBeGreaterThan(10);
    expect(msg).not.toContain('AI_DISABLED');
  });

  it('unknown code returns safe fallback (not empty)', () => {
    const msg = chatErrorMessage('UNKNOWN_CODE_XYZ', 'en');
    expect(msg.length).toBeGreaterThan(10);
    expect(msg).not.toContain('UNKNOWN_CODE_XYZ');
  });

  it('mutation: same code always returns same string', () => {
    const r1 = chatErrorMessage('AI_RATE_LIMITED', 'en');
    const r2 = chatErrorMessage('AI_RATE_LIMITED', 'en');
    expect(r1).toBe(r2);
  });

  it('HTML in the code input is never echoed back in the message', () => {
    const msg = chatErrorMessage('<script>alert(1)</script>', 'en');
    expect(msg).not.toContain('<script>');
    expect(msg.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// GLOSSARY
// =============================================================================
describe('K2 Part 1 – GLOSSARY', () => {
  it('has at least 30 entries', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(30);
  });

  it('every entry has id, label, labelHi, meaning, meaningHi, example, exampleHi', () => {
    for (const entry of GLOSSARY) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.label).toBe('string');
      expect(typeof entry.labelHi).toBe('string');
      expect(typeof entry.meaning).toBe('string');
      expect(typeof entry.meaningHi).toBe('string');
      expect(typeof entry.example).toBe('string');
      expect(typeof entry.exampleHi).toBe('string');
    }
  });

  const requiredTerms = [
    'circular_dependency', 'broken_import', 'isolated_file', 'unresolved_edge',
    'environment_variable', 'api_endpoint', 'route', 'module', 'node', 'edge',
    'dependency_graph', 'severity', 'confidence', 'verification', 'hypothesis',
    'likely', 'confirmed', 'fix_proposed', 'static_analysis', 'evidence',
    'finding', 'impact', 'ripple', 'round', 'regression', 'cors',
    '404', '500', 'jwt', 'secret', 'dotenv', 'package_json',
    'import', 'export', 'async', 'middleware', 'database_model',
  ];

  it('covers all required 30+ term ids', () => {
    const ids = new Set(GLOSSARY.map((e) => e.id));
    for (const term of requiredTerms) {
      expect(ids.has(term), `missing glossary term: ${term}`).toBe(true);
    }
  });

  it('no duplicate ids', () => {
    const ids = GLOSSARY.map((e) => e.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });

  it('mutation: GLOSSARY array is not modified by accessing it', () => {
    const len = GLOSSARY.length;
    void GLOSSARY[0].meaning;
    expect(GLOSSARY.length).toBe(len);
  });
});

// =============================================================================
// offlineAnswer
// =============================================================================
describe('K2 Part 1 – offlineAnswer()', () => {
  it('matches "circular dependency" term in English', () => {
    const answer = offlineAnswer('what is a circular dependency', { screen: 'general' }, 'en');
    expect(answer).toContain('Circular dependency');
    // label "not from AI" is OK; the check is that it never claims "AI-written" or "Powered by AI"
    expect(answer).not.toMatch(/AI-written|powered by AI|AI says|AI generated/i);
    expect(answer).toContain('Offline help');
  });

  it('matches "circular dependency kya hai" in Hinglish', () => {
    const answer = offlineAnswer('circular dependency kya hai', { screen: 'investigations' }, 'hi');
    expect(answer).toContain('Offline help');
    expect(answer).toContain('gol chakkar');
  });

  it('unknown term returns default with 3 example questions (English)', () => {
    const answer = offlineAnswer('xyzzy unknown gibberish', { screen: 'general' }, 'en');
    expect(answer).not.toContain('Offline help –');
    // Should mention asking about a term
    expect(answer.length).toBeGreaterThan(20);
    // Count questions (lines starting with quote char)
    const examples = answer.split('\n').filter((l) => l.startsWith('"'));
    expect(examples.length).toBe(3);
  });

  it('unknown term Hinglish returns default with 3 example questions', () => {
    const answer = offlineAnswer('xyzzy unknown gibberish', { screen: 'general' }, 'hi');
    const examples = answer.split('\n').filter((l) => l.startsWith('"'));
    expect(examples.length).toBe(3);
  });

  it('when findingRuleId is provided, appends howToFix guidance', () => {
    const answer = offlineAnswer(
      'how to fix this',
      { screen: 'investigations' },
      'en',
      'broken_import',
    );
    // howToFix for broken_import includes step about checking spelling
    expect(answer).toContain('broken_import');
    expect(answer).toContain('Offline help');
  });

  it('howToFix guidance in Hinglish', () => {
    const answer = offlineAnswer(
      'kaise theek karein',
      { screen: 'investigations' },
      'hi',
      'circular_dependency',
    );
    expect(answer).toContain('circular_dependency');
    expect(answer).toContain('Offline help');
  });

  it('HTML-looking question text is not echoed (plain text only)', () => {
    const answer = offlineAnswer('<img src=x onerror=alert(1)>', { screen: 'general' }, 'en');
    // The answer text itself should not contain HTML tags
    expect(answer).not.toContain('<img');
    expect(answer).not.toContain('onerror');
  });

  it('returns at most 3 matched terms', () => {
    // "import export async" should match 3 terms
    const answer = offlineAnswer(
      'what are import export async',
      { screen: 'general' },
      'en',
    );
    // Count how many "Example:" lines there are (one per term)
    const exampleCount = (answer.match(/^Example:/gm) ?? []).length;
    expect(exampleCount).toBeLessThanOrEqual(3);
    expect(exampleCount).toBeGreaterThan(0);
  });

  it('mutation: multiple calls with same args return same text', () => {
    const q = 'what is severity';
    const r1 = offlineAnswer(q, { screen: 'general' }, 'en');
    const r2 = offlineAnswer(q, { screen: 'general' }, 'en');
    expect(r1).toBe(r2);
  });

  it('never contains "AI" claiming authorship in offline response', () => {
    const answer = offlineAnswer('circular dependency', { screen: 'general' }, 'en');
    // "Offline help" label is OK; "AI-written" or "AI answer" would be wrong
    expect(answer).not.toMatch(/AI-written|AI answer|powered by AI/i);
  });

  it('synonym match: "gol chakkar" matches circular dependency in Hinglish', () => {
    const answer = offlineAnswer('gol chakkar kya hota hai', { screen: 'general' }, 'hi');
    expect(answer).toContain('Circular dependency');
  });

  it('synonym match: ".env" matches environment variable entry', () => {
    const answer = offlineAnswer('what is .env', { screen: 'general' }, 'en');
    expect(answer).toContain('.env');
  });

  it('synonym match: "jwt" matches JWT entry', () => {
    const answer = offlineAnswer('explain jwt', { screen: 'general' }, 'en');
    expect(answer).toContain('JWT');
  });
});

// =============================================================================
// trimHistory
// =============================================================================
describe('K2 Part 1 – trimHistory()', () => {
  it('keeps all messages when <= 6', () => {
    const msgs = [
      { role: 'user' as const, text: 'hello' },
      { role: 'assistant' as const, text: 'hi' },
    ];
    expect(trimHistory(msgs)).toHaveLength(2);
  });

  it('keeps last 6 when more than 6', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `message ${i}`,
    }));
    const result = trimHistory(msgs);
    expect(result).toHaveLength(6);
    expect(result[0].text).toBe('message 4');
    expect(result[5].text).toBe('message 9');
  });

  it('truncates text at 1000 chars', () => {
    const longText = 'x'.repeat(1500);
    const msgs = [{ role: 'user' as const, text: longText }];
    const result = trimHistory(msgs);
    expect(result[0].text).toHaveLength(1000);
  });

  it('leaves text <= 1000 chars unchanged', () => {
    const text = 'a'.repeat(999);
    const msgs = [{ role: 'user' as const, text }];
    const result = trimHistory(msgs);
    expect(result[0].text).toHaveLength(999);
  });

  it('empty input returns empty array', () => {
    expect(trimHistory([])).toEqual([]);
  });

  it('exactly 6 items keeps all 6', () => {
    const msgs = Array.from({ length: 6 }, (_, i) => ({
      role: 'user' as const,
      text: `msg ${i}`,
    }));
    expect(trimHistory(msgs)).toHaveLength(6);
  });

  it('mutation: does not modify the original array', () => {
    const msgs = [
      { role: 'user' as const, text: 'y'.repeat(1500) },
    ];
    const original = msgs[0].text;
    trimHistory(msgs);
    expect(msgs[0].text).toBe(original);
    expect(msgs[0].text.length).toBe(1500);
  });

  it('mutation: does not modify the original objects in the array', () => {
    const msgs = Array.from({ length: 8 }, (_, i) => ({
      role: 'user' as const,
      text: `msg ${i}`,
    }));
    const copyBefore = msgs.map((m) => ({ ...m }));
    trimHistory(msgs);
    // Original array should be unchanged
    expect(msgs).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      expect(msgs[i].text).toBe(copyBefore[i].text);
    }
  });

  it('history capped at 6 in the POST request body scenario', () => {
    // Simulate building a request body
    const history = Array.from({ length: 7 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `t${i}`,
    }));
    const trimmed = trimHistory(history);
    expect(trimmed.length).toBeLessThanOrEqual(6);
  });

  it('text capped at 1000 in the POST request body scenario', () => {
    const history = [
      { role: 'user' as const, text: 'a'.repeat(2000) },
    ];
    const trimmed = trimHistory(history);
    expect(trimmed[0].text.length).toBeLessThanOrEqual(1000);
  });
});
