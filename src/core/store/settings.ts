// `settings` store (DESIGN 4.1): plain key/value, never keys, manuscripts or personal data.
import { req, withTransaction } from './db';

export type Language = 'ko' | 'en';
export type WizardState = 'not_started' | 'skipped' | 'done';

export interface Settings {
  ui_language: Language;
  bible_id: string;
  bible_user_chosen: boolean;
  wizard_state: WizardState;
  wizard_step: string;
  font_size_px: number;
  /** Connected LLM provider id ('' = none). Plain id only; the key lives in provider_key (encrypted). */
  llm_provider: string;
  /** Model chosen for llm_provider ('' = provider default from config). */
  llm_model: string;
  /** Show the transfer notice before each generation request (DESIGN 4.4, default on). Hiding it
   *  changes nothing that is sent; excerpts still need an external_transfer consent. */
  transfer_notice: boolean;
  /** On-device AI turned on by the user (S15, default off). Used only while no key is connected. */
  device_ai_enabled: boolean;
}

export type SettingKey = keyof Settings;

interface Row<K extends SettingKey = SettingKey> {
  key: K;
  value: Settings[K];
}

export async function getSetting<K extends SettingKey>(key: K, db?: IDBDatabase): Promise<Settings[K] | undefined> {
  return withTransaction(
    'settings',
    'readonly',
    async (tx) => {
      const row = (await req(tx.objectStore('settings').get(key))) as Row<K> | undefined;
      return row?.value;
    },
    db,
  );
}

export async function setSetting<K extends SettingKey>(key: K, value: Settings[K], db?: IDBDatabase): Promise<void> {
  await withTransaction('settings', 'readwrite', (tx) => req(tx.objectStore('settings').put({ key, value } satisfies Row<K>)), db);
}

/** Write several settings atomically (one transaction). */
export async function setSettings(values: Partial<Settings>, db?: IDBDatabase): Promise<void> {
  await withTransaction(
    'settings',
    'readwrite',
    (tx) => {
      const store = tx.objectStore('settings');
      for (const [key, value] of Object.entries(values)) store.put({ key, value });
    },
    db,
  );
}

/** Raw stored values (unvalidated). Use preferences.resolveSettings to apply defaults and checks. */
export async function getAllSettings(db?: IDBDatabase): Promise<Partial<Record<SettingKey, unknown>>> {
  return withTransaction(
    'settings',
    'readonly',
    async (tx) => {
      const rows = (await req(tx.objectStore('settings').getAll())) as Row[];
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    db,
  );
}
