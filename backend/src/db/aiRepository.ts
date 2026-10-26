import { getDatabase } from './connection.js';

export interface AISettingsRecord {
  ai_enabled: boolean;
  ai_code_enabled: boolean;
  consent_version: string | null;
  consent_given_at: string | null;
  updated_at: string;
}

export function getAISettings(): AISettingsRecord {
  const db = getDatabase();
  const row = db.prepare('SELECT ai_enabled, ai_code_enabled, consent_version, consent_given_at, updated_at FROM ai_settings WHERE id = 1').get() as any;

  if (!row) {
    return {
      ai_enabled: false,
      ai_code_enabled: false,
      consent_version: null,
      consent_given_at: null,
      updated_at: new Date().toISOString(),
    };
  }

  return {
    ai_enabled: Boolean(row.ai_enabled),
    ai_code_enabled: Boolean(row.ai_code_enabled),
    consent_version: row.consent_version,
    consent_given_at: row.consent_given_at,
    updated_at: row.updated_at,
  };
}

export function updateAISettings(updates: {
  ai_enabled?: boolean;
  ai_code_enabled?: boolean;
  consent_version?: string | null;
}): AISettingsRecord {
  const db = getDatabase();
  const current = getAISettings();

  const nextAiEnabled = updates.ai_enabled !== undefined ? updates.ai_enabled : current.ai_enabled;
  const nextAiCodeEnabled = updates.ai_code_enabled !== undefined ? updates.ai_code_enabled : current.ai_code_enabled;
  let nextConsentVersion = updates.consent_version !== undefined ? updates.consent_version : current.consent_version;
  let nextConsentGivenAt = current.consent_given_at;

  if (updates.ai_enabled && !current.ai_enabled) {
    nextConsentGivenAt = new Date().toISOString();
  } else if (updates.ai_enabled === false) {
    // If disabling AI, reset consent
    nextConsentVersion = null;
    nextConsentGivenAt = null;
  }

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO ai_settings (id, ai_enabled, ai_code_enabled, consent_version, consent_given_at, updated_at)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ai_enabled = excluded.ai_enabled,
      ai_code_enabled = excluded.ai_code_enabled,
      consent_version = excluded.consent_version,
      consent_given_at = excluded.consent_given_at,
      updated_at = excluded.updated_at
  `).run(
    nextAiEnabled ? 1 : 0,
    nextAiCodeEnabled ? 1 : 0,
    nextConsentVersion,
    nextConsentGivenAt,
    now
  );

  return {
    ai_enabled: nextAiEnabled,
    ai_code_enabled: nextAiCodeEnabled,
    consent_version: nextConsentVersion,
    consent_given_at: nextConsentGivenAt,
    updated_at: now,
  };
}

export function getCachedAIResponse(cacheKey: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT response_text FROM ai_cache WHERE cache_key = ?').get(cacheKey) as any;
  return row ? row.response_text : null;
}

export function setCachedAIResponse(
  cacheKey: string,
  responseText: string,
  provider: string,
  model: string
): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO ai_cache (cache_key, response_text, provider, model, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      response_text = excluded.response_text,
      created_at = excluded.created_at
  `).run(cacheKey, responseText, provider, model, new Date().toISOString());
}
