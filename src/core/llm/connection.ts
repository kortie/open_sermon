// Connect, check and forget a provider key (DESIGN 3.6, 3.13.2, 3.13.5). Used by the wizard and the
// settings connection panel. Order on "확인": format check (unless the user insists) → daily slot →
// one validateKey call → save the key encrypted. A failed key is never saved.
import { getAllSettings, setSettings } from '../store/settings';
import { deleteProviderKey, getProviderKeyInfo, readProviderKey, saveProviderKey, type ProviderKeyInfo } from '../vault/providerKey';
import { takeDailySlot } from './dailyLimit';
import { createClient, keyFormatOk, providerConfig, resolveModel, type RegistryConfig } from './registry';
import { LlmError, type FetchFn, type LlmClient } from './types';

export interface ConnectOptions {
  /** The user pressed "check anyway" after the format notice. */
  ignoreFormat?: boolean;
  fetch?: FetchFn;
  cfg?: RegistryConfig;
  now?: Date;
  limit?: number;
  db?: IDBDatabase;
}

/** Check the key with one request and store it. Resolves with the masked-display info. */
export async function verifyAndSaveKey(provider: string, model: string, key: string, opts: ConnectOptions = {}): Promise<ProviderKeyInfo> {
  if (!providerConfig(provider, opts.cfg)) throw new LlmError('unknown');
  if (!opts.ignoreFormat && !keyFormatOk(provider, key, opts.cfg)) throw new LlmError('format');
  const client = createClient(provider, key, model, { fetch: opts.fetch, cfg: opts.cfg });
  await takeDailySlot({ now: opts.now, limit: opts.limit, db: opts.db });
  await client.validateKey();
  const saved = await saveProviderKey(provider, key, (opts.now ?? new Date()).getTime(), opts.db);
  await setSettings({ llm_provider: provider, llm_model: resolveModel(provider, model, opts.cfg) }, opts.db);
  return saved;
}

export interface Connection {
  provider: string;
  model: string;
  key_last4: string;
}

/** The current connection (provider with a stored key), or null. */
export async function getConnection(opts: { cfg?: RegistryConfig; db?: IDBDatabase } = {}): Promise<Connection | null> {
  const raw = await getAllSettings(opts.db);
  const provider = typeof raw.llm_provider === 'string' ? raw.llm_provider : '';
  if (!provider || !providerConfig(provider, opts.cfg)) return null;
  const info = await getProviderKeyInfo(provider, opts.db);
  if (!info) return null;
  return { provider, model: resolveModel(provider, typeof raw.llm_model === 'string' ? raw.llm_model : '', opts.cfg), key_last4: info.key_last4 };
}

export async function setModel(provider: string, model: string, opts: { cfg?: RegistryConfig; db?: IDBDatabase } = {}): Promise<void> {
  await setSettings({ llm_model: resolveModel(provider, model, opts.cfg) }, opts.db);
}

/** Delete the key now and clear the connection. */
export async function disconnect(provider: string, db?: IDBDatabase): Promise<void> {
  await deleteProviderKey(provider, db);
  await setSettings({ llm_provider: '' }, db);
}

/** A client for the current connection, or null when not connected. Used by S09 generation. */
export async function connectedClient(opts: { fetch?: FetchFn; cfg?: RegistryConfig; db?: IDBDatabase } = {}): Promise<LlmClient | null> {
  const conn = await getConnection(opts);
  if (!conn) return null;
  const key = await readProviderKey(conn.provider, opts.db);
  if (!key) return null;
  return createClient(conn.provider, key, conn.model, opts);
}
