import { useState, useCallback } from "react";
import { translations, type Lang } from "@/lib/i18n";

const STORAGE_KEY = "voyageai_lang";

function getInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
    // Auto-detect from browser
    const browser = navigator.language.toLowerCase();
    if (browser.startsWith("zh")) return "zh";
    return "en";
  } catch {
    return "zh";
  }
}

// Module-level state so all components share the same lang
let _lang: Lang = getInitialLang();
const _listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function setGlobalLang(lang: Lang) {
  _lang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  _listeners.forEach(fn => fn());
}

export function useI18n() {
  const [, forceUpdate] = useState(0);

  // Subscribe to global lang changes
  useState(() => {
    const unsub = subscribe(() => forceUpdate(n => n + 1));
    return unsub;
  });

  const t = useCallback(
    (key: keyof typeof translations.zh, ...args: any[]): string => {
      const val = (translations[_lang] as any)[key];
      if (typeof val === "function") return val(...args);
      return val ?? (translations.zh as any)[key] ?? key;
    },
    [_lang]
  );

  return {
    t,
    lang: _lang,
    setLang: setGlobalLang,
    isZh: _lang === "zh",
    isEn: _lang === "en",
  };
}
