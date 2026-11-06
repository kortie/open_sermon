import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkI18n } from '../../../scripts/check-i18n.mjs';

function fixture(ko: object, en: object, source = '') {
  const root = mkdtempSync(join(tmpdir(), 'i18n-'));
  mkdirSync(join(root, 'i18n'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'i18n/ko.json'), JSON.stringify(ko));
  writeFileSync(join(root, 'i18n/en.json'), JSON.stringify(en));
  writeFileSync(join(root, 'src/view.tsx'), source);
  return checkI18n(join(root, 'i18n'), join(root, 'src')) as string[];
}

describe('check-i18n', () => {
  it('passes matching dictionaries and defined keys', () => {
    expect(fixture({ a: { b: '가' } }, { a: { b: 'A' } }, "t('a.b')")).toEqual([]);
  });

  it('fails on a key missing in either language', () => {
    const errors = fixture({ a: '가', only_ko: '나' }, { a: 'A', only_en: 'B' });
    expect(errors).toContainEqual(expect.stringContaining('"only_ko" in ko.json missing in en.json'));
    expect(errors).toContainEqual(expect.stringContaining('"only_en" in en.json missing in ko.json'));
  });

  it('fails on an empty value', () => {
    expect(fixture({ a: ' ' }, { a: 'A' })).toContainEqual(expect.stringContaining('empty or non-string value for "a" in ko.json'));
  });

  it('fails on a key used in code but not defined', () => {
    expect(fixture({ a: '가' }, { a: 'A' }, 'const x = t("missing.key");')).toContainEqual(
      expect.stringContaining('"missing.key" used in'),
    );
  });

  it('fails on internal terms in screen strings (CLAUDE.md rule 14), keys are allowed', () => {
    const errors = fixture({ humor: '유머 한마디' }, { humor: 'Humor' });
    expect(errors).toContainEqual(expect.stringContaining('internal term in ko.json "humor"'));
    expect(errors).toContainEqual(expect.stringContaining('internal term in en.json "humor"'));
    expect(fixture({ humor: '가벼운 한마디' }, { humor: 'Light Remark' })).toEqual([]);
  });
});
