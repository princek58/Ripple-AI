import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  getHowToFix,
  HOW_TO_FIX_DATA,
  type Lang,
} from '../features/investigations/howToFix.js';
import {
  useExplainLanguage,
  EXPLAIN_LANG_STORAGE_KEY,
} from '../lib/useExplainLanguage.js';

describe('HowToFix Guidance Content & Language (Step 12a-2 Part 1)', () => {
  const KNOWN_RULES = [
    'circular_dependency',
    'broken_import',
    'isolated_file',
    'env_undeclared',
    'api_unmatched_call',
    'secret_pattern',
  ];

  it('all six known rule ids have non-empty whatItMeans, steps and verify in BOTH languages', () => {
    const langs: Lang[] = ['en', 'hi'];

    for (const ruleId of KNOWN_RULES) {
      for (const lang of langs) {
        const guidance = getHowToFix(ruleId, lang);
        expect(guidance, `Guidance for ${ruleId} (${lang}) must exist`).toBeDefined();
        expect(guidance.whatItMeans.trim().length, `${ruleId} (${lang}) whatItMeans`).toBeGreaterThan(0);
        expect(guidance.steps.length, `${ruleId} (${lang}) steps count`).toBeGreaterThan(0);
        for (const step of guidance.steps) {
          expect(step.trim().length, `${ruleId} (${lang}) step text`).toBeGreaterThan(0);
        }
        expect(guidance.verify.trim().length, `${ruleId} (${lang}) verify text`).toBeGreaterThan(0);
      }
    }
  });

  it('the number of steps is equal in en and hi for every rule', () => {
    for (const ruleId of KNOWN_RULES) {
      const en = getHowToFix(ruleId, 'en');
      const hi = getHowToFix(ruleId, 'hi');
      expect(en.steps.length, `${ruleId} step counts must match`).toBe(hi.steps.length);
    }

    // Also verify generic entry has matching step count
    const genericEn = getHowToFix('unknown_rule_xyz', 'en');
    const genericHi = getHowToFix('unknown_rule_xyz', 'hi');
    expect(genericEn.steps.length).toBe(genericHi.steps.length);
  });

  it('the unknown rule returns the generic entry', () => {
    const fallbackEn = getHowToFix('non_existent_check_123', 'en');
    const genericEn = HOW_TO_FIX_DATA.generic.en;
    expect(fallbackEn).toEqual(genericEn);

    const fallbackHi = getHowToFix('non_existent_check_123', 'hi');
    const genericHi = HOW_TO_FIX_DATA.generic.hi;
    expect(fallbackHi).toEqual(genericHi);
  });

  it('secret_pattern text in both languages tells the user not to paste the secret', () => {
    const en = getHowToFix('secret_pattern', 'en');
    const hi = getHowToFix('secret_pattern', 'hi');

    const enCombined = [en.whatItMeans, ...en.steps, en.verify, en.caution ?? ''].join(' ');
    const hiCombined = [hi.whatItMeans, ...hi.steps, hi.verify, hi.caution ?? ''].join(' ');

    expect(enCombined).toContain('Never paste the secret');
    expect(hiCombined).toContain('kabhi paste mat karo');
  });

  it('no entry contains any forbidden phrases ("guaranteed", "automatically fixed", "100%")', () => {
    const forbidden = ['guaranteed', 'automatically fixed', '100%'];

    for (const [ruleId, langMap] of Object.entries(HOW_TO_FIX_DATA)) {
      for (const [lang, guidance] of Object.entries(langMap)) {
        const fullText = [
          guidance.whatItMeans,
          ...guidance.steps,
          guidance.verify,
          guidance.caution ?? '',
        ]
          .join(' ')
          .toLowerCase();

        for (const word of forbidden) {
          expect(
            fullText.includes(word.toLowerCase()),
            `Rule "${ruleId}" in "${lang}" must not contain forbidden phrase "${word}"`
          ).toBe(false);
        }
      }
    }
  });

  describe('useExplainLanguage hook', () => {
    beforeEach(() => {
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('defaults to "en" when localStorage is empty', () => {
      const { result } = renderHook(() => useExplainLanguage());
      expect(result.current[0]).toBe('en');
    });

    it('persists and restores "hi" to/from localStorage', () => {
      const { result } = renderHook(() => useExplainLanguage());
      expect(result.current[0]).toBe('en');

      act(() => {
        result.current[1]('hi');
      });

      expect(result.current[0]).toBe('hi');
      expect(localStorage.getItem(EXPLAIN_LANG_STORAGE_KEY)).toBe('hi');

      // Re-mount hook and ensure choice persisted
      const { result: reloaded } = renderHook(() => useExplainLanguage());
      expect(reloaded.current[0]).toBe('hi');
    });

    it('handles localStorage errors gracefully and falls back to "en"', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      const { result } = renderHook(() => useExplainLanguage());
      expect(result.current[0]).toBe('en');

      // setItem throwing should not crash
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Quota exceeded');
      });

      act(() => {
        result.current[1]('hi');
      });
      expect(result.current[0]).toBe('hi');
    });
  });
});
