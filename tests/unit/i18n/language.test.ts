// Language and bible rules (S02 설계 상세, DESIGN 3.12) and font size normalization (3.16).
import { describe, expect, it } from 'vitest';
import appConfig from '../../../config/app.config.json';
import {
  bibleChoice,
  dailyIndex,
  languageChange,
  normalizeFontSize,
  recommendLanguage,
  resolveSettings,
} from '../../../src/core/store/preferences';
import type { Settings } from '../../../src/core/store/settings';

const cfg = appConfig;
const base = (over: Partial<Settings> = {}): Settings => ({ ...resolveSettings({}, cfg, 'ko-KR'), ...over });

describe('recommendLanguage', () => {
  it.each([
    ['ko-KR', 'ko'],
    ['ko', 'ko'],
    ['KO-kr', 'ko'],
    ['en-US', 'en'],
    ['ja-JP', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ])('%s → %s', (device, lang) => {
    expect(recommendLanguage(device)).toBe(lang);
  });
});

describe('resolveSettings', () => {
  it('first run: device language, its default bible, wizard not started, 16px', () => {
    expect(resolveSettings({}, cfg, 'ko-KR')).toEqual({
      ui_language: 'ko',
      bible_id: 'krv',
      bible_user_chosen: false,
      wizard_state: 'not_started',
      wizard_step: 'language',
      font_size_px: 16,
      llm_provider: '',
      llm_model: '',
      transfer_notice: true,
      device_ai_enabled: false,
    });
    expect(resolveSettings({}, cfg, 'en-US')).toMatchObject({ ui_language: 'en', bible_id: 'kjv' });
  });

  it('keeps valid stored values and repairs invalid ones', () => {
    expect(
      resolveSettings(
        { ui_language: 'en', bible_id: 'krv', bible_user_chosen: true, wizard_state: 'done', wizard_step: 'bible', font_size_px: 22, llm_provider: 'anthropic', llm_model: 'm', transfer_notice: false, device_ai_enabled: true },
        cfg,
        'ko-KR',
      ),
    ).toEqual({ ui_language: 'en', bible_id: 'krv', bible_user_chosen: true, wizard_state: 'done', wizard_step: 'bible', font_size_px: 22, llm_provider: 'anthropic', llm_model: 'm', transfer_notice: false, device_ai_enabled: true });

    expect(
      resolveSettings({ ui_language: 'fr', bible_id: 'niv', bible_user_chosen: true, wizard_state: 'x', wizard_step: 'nope', font_size_px: 30, llm_provider: 5, device_ai_enabled: 'yes' }, cfg, 'en-GB'),
    ).toEqual({ ui_language: 'en', bible_id: 'kjv', bible_user_chosen: false, wizard_state: 'not_started', wizard_step: 'language', font_size_px: 16, llm_provider: '', llm_model: '', transfer_notice: true, device_ai_enabled: false });
  });
});

describe('language change and bible choice', () => {
  it('ko → en without a direct choice switches the bible to kjv', () => {
    expect(languageChange(base(), 'en', cfg)).toEqual({ ui_language: 'en', bible_id: 'kjv' });
  });

  it('ko → en after choosing krv directly keeps krv', () => {
    const s = base({ bible_user_chosen: true, bible_id: 'krv' });
    expect(languageChange(s, 'en', cfg)).toEqual({ ui_language: 'en' });
  });

  it('a choice in settings is always direct', () => {
    expect(bibleChoice(base(), 'krv', 'settings', cfg)).toEqual({ bible_id: 'krv', bible_user_chosen: true });
    expect(bibleChoice(base(), 'kjv', 'settings', cfg)).toEqual({ bible_id: 'kjv', bible_user_chosen: true });
  });

  it('confirming the default in the wizard is not a direct choice; picking another is', () => {
    expect(bibleChoice(base(), 'krv', 'wizard', cfg)).toEqual({ bible_id: 'krv', bible_user_chosen: false });
    expect(bibleChoice(base(), 'kjv', 'wizard', cfg)).toEqual({ bible_id: 'kjv', bible_user_chosen: true });
  });

  it('rejects bibles that are not available (e.g. niv)', () => {
    expect(bibleChoice(base(), 'niv', 'settings', cfg)).toBeNull();
  });
});

describe('font size', () => {
  it.each([
    [16, 16],
    [18, 18],
    [20, 20],
    [22, 22],
    [12, 16],
    [30, 16],
    [17, 16],
    ['22', 16],
    [undefined, 16],
  ])('%s → %s', (v, px) => {
    expect(normalizeFontSize(v, cfg)).toBe(px);
  });
});

describe('dailyIndex', () => {
  it('changes once per local day and cycles through the list', () => {
    const d1 = new Date(2026, 10, 4, 0, 1);
    const d1late = new Date(2026, 10, 4, 23, 59);
    const d2 = new Date(2026, 10, 5, 0, 1);
    expect(dailyIndex(d1, 31)).toBe(dailyIndex(d1late, 31));
    expect(dailyIndex(d2, 31)).toBe((dailyIndex(d1, 31) + 1) % 31);
    expect(dailyIndex(d1, 0)).toBe(0);
    const seen = new Set(Array.from({ length: 31 }, (_, i) => dailyIndex(new Date(2026, 0, 1 + i), 31)));
    expect(seen.size).toBe(31);
  });
});
