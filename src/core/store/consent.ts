// consent_log store (DESIGN 4.1). Plain records of what the user agreed to and when.
import { req, withTransaction } from './db';

export type ConsentKind = 'sermon_rights' | 'external_transfer' | 'bible_rights' | 'backup_include_key' | 'backup_include_bible';

export interface ConsentRecord {
  id: string;
  kind: ConsentKind;
  target_id: string | null;
  granted: boolean;
  /** Epoch ms. */
  at: number;
}

/** Add a consent record inside an existing transaction that includes consent_log. */
export function putConsentTx(tx: IDBTransaction, rec: ConsentRecord): Promise<IDBValidKey> {
  return req(tx.objectStore('consent_log').put(rec));
}

export function listConsents(db?: IDBDatabase): Promise<ConsentRecord[]> {
  return withTransaction('consent_log', 'readonly', (tx) => req(tx.objectStore('consent_log').getAll()) as Promise<ConsentRecord[]>, db);
}

/** Add one consent record in its own transaction. */
export async function recordConsent(rec: ConsentRecord, db?: IDBDatabase): Promise<void> {
  await withTransaction('consent_log', 'readwrite', (tx) => putConsentTx(tx, rec), db);
}

/** The latest decision for (kind, target); false when there is none (default: not granted). */
export async function hasConsent(kind: ConsentKind, targetId: string | null, db?: IDBDatabase): Promise<boolean> {
  const latest = (await listConsents(db))
    .filter((c) => c.kind === kind && c.target_id === targetId)
    .sort((a, b) => b.at - a.at)[0];
  return latest?.granted === true;
}
