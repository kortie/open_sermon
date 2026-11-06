// `persona` store (DESIGN 4.1): allowed codes and a short label only. Every read is validated
// again; rows that no longer pass (old values) are skipped. The active persona id is kept in
// the settings store under `persona_id`.
import type { Persona } from '../persona/options';
import { validatePersona } from '../persona/validate';
import { req, withTransaction } from './db';

const ACTIVE_KEY = 'persona_id';

export async function savePersona(input: unknown, db?: IDBDatabase): Promise<ReturnType<typeof validatePersona>> {
  const r = validatePersona(input);
  if (!r.ok) return r;
  await withTransaction('persona', 'readwrite', (tx) => req(tx.objectStore('persona').put(r.persona)), db);
  return r;
}

export async function listPersonas(db?: IDBDatabase): Promise<Persona[]> {
  const rows = await withTransaction('persona', 'readonly', (tx) => req(tx.objectStore('persona').getAll()), db);
  const out: Persona[] = [];
  for (const row of rows) {
    const r = validatePersona(row);
    if (r.ok) out.push(r.persona);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function deletePersona(id: string, db?: IDBDatabase): Promise<void> {
  await withTransaction(
    ['persona', 'settings'],
    'readwrite',
    async (tx) => {
      const active = (await req(tx.objectStore('settings').get(ACTIVE_KEY))) as { value?: unknown } | undefined;
      await req(tx.objectStore('persona').delete(id));
      if (active?.value === id) await req(tx.objectStore('settings').delete(ACTIVE_KEY));
    },
    db,
  );
}

/** Active persona, or null when none is chosen or it no longer exists / validates. */
export async function getActivePersona(db?: IDBDatabase): Promise<Persona | null> {
  return withTransaction(
    ['persona', 'settings'],
    'readonly',
    async (tx) => {
      const active = (await req(tx.objectStore('settings').get(ACTIVE_KEY))) as { value?: unknown } | undefined;
      if (typeof active?.value !== 'string') return null;
      const row: unknown = await req(tx.objectStore('persona').get(active.value));
      const r = validatePersona(row);
      return r.ok ? r.persona : null;
    },
    db,
  );
}

export async function setActivePersona(id: string | null, db?: IDBDatabase): Promise<void> {
  await withTransaction(
    'settings',
    'readwrite',
    async (tx) => {
      const store = tx.objectStore('settings');
      if (id === null) await req(store.delete(ACTIVE_KEY));
      else await req(store.put({ key: ACTIVE_KEY, value: id }));
    },
    db,
  );
}
