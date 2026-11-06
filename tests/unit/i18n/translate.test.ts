import { describe, expect, it } from 'vitest';
import { createTranslator, dictionaries, getLanguage, setLanguage, subscribeLanguage, t } from '../../../src/i18n';

describe('t()', () => {
  it('returns different values for the same key in ko and en', () => {
    setLanguage('ko');
    const ko = t('app.title');
    setLanguage('en');
    const en = t('app.title');
    setLanguage('ko');
    expect(ko).not.toBe(en);
    expect(ko.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
  });

  it('throws on a missing key in strict mode (dev/test)', () => {
    expect(() => t('no.such.key')).toThrow(/Missing i18n key "no.such.key"/);
  });

  it('returns the key itself for a missing key in non-strict mode (production)', () => {
    const translate = createTranslator(dictionaries, { strict: false });
    expect(translate('ko', 'no.such.key')).toBe('no.such.key');
  });

  it('does not resolve a key that points to a group, not a string', () => {
    const translate = createTranslator(dictionaries, { strict: false });
    expect(translate('ko', 'app')).toBe('app');
  });

  it('interpolates {params} and leaves unknown params untouched', () => {
    const translate = createTranslator(
      { ko: { a11y: { selected: '선택됨, {verse}절 {x}' } }, en: { a11y: { selected: 'Selected, verse {verse}' } } },
      { strict: true },
    );
    expect(translate('ko', 'a11y.selected', { verse: 27 })).toBe('선택됨, 27절 {x}');
    expect(translate('en', 'a11y.selected', { verse: 27 })).toBe('Selected, verse 27');
  });

  it('notifies subscribers on language change only when it actually changes', () => {
    setLanguage('ko');
    let calls = 0;
    const off = subscribeLanguage(() => calls++);
    setLanguage('ko');
    setLanguage('en');
    off();
    setLanguage('ko');
    expect(calls).toBe(1);
    expect(getLanguage()).toBe('ko');
  });
});
