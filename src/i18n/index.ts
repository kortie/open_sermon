// Screen strings live only in ko.json / en.json (CLAUDE.md rule 16).
// Language state is in memory until S02 connects it to the settings store.
import { useSyncExternalStore } from 'react';
import ko from './ko.json';
import en from './en.json';

export type Lang = 'ko' | 'en';
export type Dict = { [key: string]: string | Dict };
export type Params = Record<string, string | number>;

export const dictionaries: Record<Lang, Dict> = { ko, en };

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/**
 * Build a translator. In strict mode (development, tests) a missing key throws;
 * otherwise the key itself is returned so the screen never shows "undefined".
 */
export function createTranslator(dicts: Record<Lang, Dict>, { strict }: { strict: boolean }) {
  return function translate(lang: Lang, key: string, params?: Params): string {
    const text = lookup(dicts[lang], key);
    if (text === undefined) {
      if (strict) throw new Error(`Missing i18n key "${key}" for language "${lang}"`);
      return key;
    }
    return interpolate(text, params);
  };
}

const translate = createTranslator(dictionaries, { strict: import.meta.env.DEV });

let current: Lang = 'ko';
const listeners = new Set<() => void>();

export function getLanguage(): Lang {
  return current;
}

export function setLanguage(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  listeners.forEach((fn) => fn());
}

export function subscribeLanguage(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key: string, params?: Params): string {
  return translate(current, key, params);
}

/** Re-render on language change (screens switch immediately, CLAUDE.md 4.3). */
export function useLanguage(): Lang {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}
