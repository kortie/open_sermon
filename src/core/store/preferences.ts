// Pure rules for user preferences (DESIGN 3.12, 3.13, 3.16; S02 설계 상세). No I/O here.
import type { Language, Settings, SettingKey, WizardState } from './settings';

export interface PreferenceConfig {
  i18n: {
    supported_languages: string[];
    default_bible: Record<string, string>;
    available_bibles: Record<string, string[]>;
  };
  ui: { font_size_px: { default: number; options: number[] } };
  wizard: { steps: string[] };
}

const WIZARD_STATES: readonly WizardState[] = ['not_started', 'skipped', 'done'];

/** First run: device language starting with "ko" → Korean, anything else → English. */
export function recommendLanguage(deviceLanguage: string | undefined): Language {
  return deviceLanguage?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

/** Values outside config options fall back to the default (16px). */
export function normalizeFontSize(value: unknown, cfg: PreferenceConfig): number {
  const { options, default: def } = cfg.ui.font_size_px;
  return typeof value === 'number' && options.includes(value) ? value : def;
}

export function availableBibles(cfg: PreferenceConfig): string[] {
  return [...new Set(Object.values(cfg.i18n.available_bibles).flat())];
}

function isLanguage(v: unknown, cfg: PreferenceConfig): v is Language {
  return typeof v === 'string' && cfg.i18n.supported_languages.includes(v) && (v === 'ko' || v === 'en');
}

/**
 * Stored (possibly missing or stale) values → complete, valid settings.
 * @param imported ids of the imported bibles on this device (S11); a stored id that is neither
 *   bundled nor imported (e.g. a deleted imported bible) falls back to the language default.
 */
export function resolveSettings(
  raw: Partial<Record<SettingKey, unknown>>,
  cfg: PreferenceConfig,
  deviceLanguage?: string,
  imported: readonly string[] = [],
): Settings {
  const ui_language = isLanguage(raw.ui_language, cfg) ? raw.ui_language : recommendLanguage(deviceLanguage);
  const bibleOk = typeof raw.bible_id === 'string' && (availableBibles(cfg).includes(raw.bible_id) || imported.includes(raw.bible_id));
  const bible_id = bibleOk ? (raw.bible_id as string) : (cfg.i18n.default_bible[ui_language] ?? availableBibles(cfg)[0] ?? '');
  return {
    ui_language,
    bible_id,
    bible_user_chosen: bibleOk && raw.bible_user_chosen === true,
    wizard_state: WIZARD_STATES.includes(raw.wizard_state as WizardState) ? (raw.wizard_state as WizardState) : 'not_started',
    wizard_step:
      typeof raw.wizard_step === 'string' && cfg.wizard.steps.includes(raw.wizard_step) ? raw.wizard_step : (cfg.wizard.steps[0] ?? ''),
    font_size_px: normalizeFontSize(raw.font_size_px, cfg),
    // Validated against config by core/llm (registry) when used; unknown ids act as "not connected".
    llm_provider: typeof raw.llm_provider === 'string' ? raw.llm_provider : '',
    llm_model: typeof raw.llm_model === 'string' ? raw.llm_model : '',
    transfer_notice: raw.transfer_notice !== false,
    device_ai_enabled: raw.device_ai_enabled === true,
  };
}

/** Language change: the bible follows the language default unless the user chose one. */
export function languageChange(current: Settings, lang: Language, cfg: PreferenceConfig): Partial<Settings> {
  const patch: Partial<Settings> = { ui_language: lang };
  if (!current.bible_user_chosen) patch.bible_id = cfg.i18n.default_bible[lang] ?? current.bible_id;
  return patch;
}

/**
 * Bible choice. In settings it is always a direct choice. In the wizard, confirming the language
 * default is not a direct choice; picking a different bible is.
 */
export function bibleChoice(
  current: Settings,
  bible: string,
  source: 'settings' | 'wizard',
  cfg: PreferenceConfig,
  imported: readonly string[] = [],
): Partial<Settings> | null {
  if (!availableBibles(cfg).includes(bible) && !imported.includes(bible)) return null;
  const isDefault = cfg.i18n.default_bible[current.ui_language] === bible;
  return { bible_id: bible, bible_user_chosen: source === 'settings' ? true : !isDefault };
}

/** The chosen bible is gone (imported bible deleted): back to the language default, not user-chosen. */
export function bibleRemoved(current: Settings, removed: string, cfg: PreferenceConfig): Partial<Settings> | null {
  if (current.bible_id !== removed) return null;
  return { bible_id: cfg.i18n.default_bible[current.ui_language] ?? availableBibles(cfg)[0] ?? '', bible_user_chosen: false };
}

/** Bundled bible whose text is quoted and sent (rule 15): the chosen one, or the language default
 *  when an imported bible is being read. */
export function bundledBibleFor(current: Settings, cfg: PreferenceConfig): string {
  if (availableBibles(cfg).includes(current.bible_id)) return current.bible_id;
  return cfg.i18n.default_bible[current.ui_language] ?? availableBibles(cfg)[0] ?? '';
}

/** Index into the daily verse list: days since 1970-01-01 in the device's local calendar. */
export function dailyIndex(date: Date, length: number): number {
  if (length <= 0) return 0;
  const days = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return ((days % length) + length) % length;
}
