// S11: imported bibles as a bible choice — accepted while present, back to the language default
// when deleted or missing, and requests/outlines always use a bundled bible.
import { describe, expect, it } from 'vitest';
import { i18n, ui, wizard } from '../../../config/app.config.json';
import { bibleChoice, bibleRemoved, bundledBibleFor, languageChange, resolveSettings } from '../../../src/core/store/preferences';

const cfg = { i18n, ui, wizard };
const IMP = 'imp-1234';

describe('imported bible preferences', () => {
  it('a stored imported id is kept only while that bible exists', () => {
    expect(resolveSettings({ ui_language: 'ko', bible_id: IMP, bible_user_chosen: true }, cfg, 'ko', [IMP])).toMatchObject({ bible_id: IMP, bible_user_chosen: true });
    expect(resolveSettings({ ui_language: 'ko', bible_id: IMP, bible_user_chosen: true }, cfg, 'ko', [])).toMatchObject({ bible_id: 'krv', bible_user_chosen: false });
    expect(resolveSettings({ ui_language: 'en', bible_id: IMP }, cfg, 'en')).toMatchObject({ bible_id: 'kjv' });
  });

  it('choosing an imported bible in settings is a direct choice kept across language changes', () => {
    const s = resolveSettings({ ui_language: 'ko' }, cfg, 'ko');
    expect(bibleChoice(s, IMP, 'settings', cfg)).toBeNull();
    const patch = bibleChoice(s, IMP, 'settings', cfg, [IMP]);
    expect(patch).toEqual({ bible_id: IMP, bible_user_chosen: true });
    expect(languageChange({ ...s, ...patch! }, 'en', cfg)).toEqual({ ui_language: 'en' });
  });

  it('deleting the chosen imported bible returns to the language default', () => {
    const s = { ...resolveSettings({ ui_language: 'en' }, cfg, 'en'), bible_id: IMP, bible_user_chosen: true };
    expect(bibleRemoved(s, IMP, cfg)).toEqual({ bible_id: 'kjv', bible_user_chosen: false });
    expect(bibleRemoved(s, 'imp-other', cfg)).toBeNull();
  });

  it('the bundled bible for quotes and requests: the chosen bundled one, or the language default', () => {
    const ko = resolveSettings({ ui_language: 'ko' }, cfg, 'ko');
    expect(bundledBibleFor({ ...ko, bible_id: 'kjv' }, cfg)).toBe('kjv');
    expect(bundledBibleFor({ ...ko, bible_id: IMP }, cfg)).toBe('krv');
    expect(bundledBibleFor({ ...ko, ui_language: 'en', bible_id: IMP }, cfg)).toBe('kjv');
  });
});
