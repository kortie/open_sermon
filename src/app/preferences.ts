// In-memory copy of `settings` for the screens, persisted through core/store.
// If IndexedDB is unavailable (private mode, blocked), the app still works with defaults in memory.
import { useSyncExternalStore } from 'react';
import { i18n as i18nConfig, ui, wizard } from '../../config/app.config.json';
import {
  bibleChoice,
  bibleRemoved,
  bundledBibleFor,
  getAllSettings,
  listImportedBibles,
  languageChange,
  normalizeFontSize,
  resolveSettings,
  setSettings,
  type Language,
  type Settings,
  type WizardState,
} from '../core/store';
import { setLanguage as setUiLanguage } from '../i18n';
import { applyFontSize } from './font-size';

const appConfig = { i18n: i18nConfig, ui, wizard };

let state: Settings = resolveSettings({}, appConfig, typeof navigator === 'undefined' ? undefined : navigator.language);
let persist = true;
/** Ids of the imported bibles on this device (S11): valid choices besides the bundled ones. */
let imported: string[] = [];
const listeners = new Set<() => void>();

function apply(next: Settings): void {
  state = next;
  setUiLanguage(next.ui_language);
  applyFontSize(next.font_size_px);
  listeners.forEach((fn) => fn());
}

async function update(patch: Partial<Settings>): Promise<void> {
  apply({ ...state, ...patch });
  if (!persist) return;
  try {
    await setSettings(patch);
  } catch {
    persist = false; // keep working in memory
  }
}

/** Load stored settings before the first render. */
export async function loadPreferences(): Promise<Settings> {
  try {
    const raw = await getAllSettings();
    imported = await listImportedBibles().then(
      (list) => list.map((b) => b.id),
      () => [],
    );
    apply(resolveSettings(raw, appConfig, navigator.language, imported));
  } catch {
    persist = false;
    apply(state);
  }
  return state;
}

export function getPreferences(): Settings {
  return state;
}

export function usePreferences(): Settings {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

export const preferences = {
  setLanguage: (lang: Language) => update(languageChange(state, lang, appConfig)),
  chooseBible: (bible: string, source: 'settings' | 'wizard') => {
    const patch = bibleChoice(state, bible, source, appConfig, imported);
    return patch ? update(patch) : Promise.resolve();
  },
  /** After an imported bible is saved or deleted. Deleting the chosen one returns to the default. */
  setImportedBibles: (ids: string[], removed?: string) => {
    imported = [...ids];
    const patch = removed ? bibleRemoved(state, removed, appConfig) : null;
    return patch ? update(patch) : Promise.resolve();
  },
  setFontSize: (px: number) => update({ font_size_px: normalizeFontSize(px, appConfig) }),
  setWizard: (wizard_state: WizardState, wizard_step?: string) =>
    update(wizard_step === undefined ? { wizard_state } : { wizard_state, wizard_step }),
  setWizardStep: (wizard_step: string) => update({ wizard_step }),
  setTransferNotice: (transfer_notice: boolean) => update({ transfer_notice }),
};

/** Bundled bible whose text is quoted in outlines and sent with requests (CLAUDE.md rule 15). */
export function bundledBible(s: Settings): string {
  return bundledBibleFor(s, appConfig);
}
