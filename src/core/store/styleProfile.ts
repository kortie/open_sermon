// style_profile store (DESIGN 4.1). One record (id STYLE_PROFILE_ID), plain: the profile holds
// summaries and short phrases only, never manuscript sentences (S10).
import { req, withTransaction } from './db';

export const STYLE_PROFILE_ID = 'current';

export interface StyleProfileRecord {
  id: string;
  /** JSON of core/sermon StyleProfile; null once a sermon deletion wiped it (stale marker). */
  profile_json: string | null;
  /** computeSourceHash() of the sermon set the profile was made from. */
  source_hash: string;
  prompt_version: string;
  sermon_count: number;
  created_at: number;
}

export function getStyleProfileRecord(db?: IDBDatabase): Promise<StyleProfileRecord | undefined> {
  return withTransaction('style_profile', 'readonly', (tx) => req(tx.objectStore('style_profile').get(STYLE_PROFILE_ID)) as Promise<StyleProfileRecord | undefined>, db);
}

export async function putStyleProfileRecord(rec: StyleProfileRecord, db?: IDBDatabase): Promise<void> {
  await withTransaction('style_profile', 'readwrite', (tx) => req(tx.objectStore('style_profile').put(rec)), db);
}

export async function deleteStyleProfileRecord(db?: IDBDatabase): Promise<void> {
  await withTransaction('style_profile', 'readwrite', (tx) => req(tx.objectStore('style_profile').clear()), db);
}

/**
 * Inside a sermon-deletion transaction: wipe every profile's content (it may hold phrases of the
 * deleted sermon) and keep only a content-free marker so the screen can offer "make again".
 */
export async function wipeStyleProfilesTx(tx: IDBTransaction): Promise<void> {
  const store = tx.objectStore('style_profile');
  const all = (await req(store.getAll())) as Partial<StyleProfileRecord>[];
  await req(store.clear());
  await Promise.all(
    all
      .filter((r) => r.id === STYLE_PROFILE_ID)
      .map((r) =>
        req(
          store.put({
            id: STYLE_PROFILE_ID,
            profile_json: null,
            source_hash: '',
            prompt_version: typeof r.prompt_version === 'string' ? r.prompt_version : '',
            sermon_count: 0,
            created_at: typeof r.created_at === 'number' ? r.created_at : 0,
          } satisfies StyleProfileRecord),
        ),
      ),
  );
}
