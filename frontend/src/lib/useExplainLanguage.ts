import { useState, useCallback } from 'react';
import type { Lang } from '../features/investigations/howToFix.js';

export const EXPLAIN_LANG_STORAGE_KEY = 'ripple.explainLang';

function getStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(EXPLAIN_LANG_STORAGE_KEY);
    if (stored === 'hi' || stored === 'en') {
      return stored;
    }
  } catch {
    // Return default on storage errors (e.g. disabled storage, private browsing)
  }
  return 'en';
}

function setStoredLang(lang: Lang): void {
  try {
    localStorage.setItem(EXPLAIN_LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore storage write errors
  }
}

export function useExplainLanguage(): [Lang, (lang: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(getStoredLang);

  const setLang = useCallback((nextLang: Lang) => {
    setLangState(nextLang);
    setStoredLang(nextLang);
  }, []);

  return [lang, setLang];
}
