// Reading and deleting saved sermons. Decryption happens only when a screen asks for the text.
import { outlineUpdatesForSermonDeletion } from '../compose/outline';
import { StaleOutlineError } from '../store/outline';
import { deleteSermon as deleteSermonStores, getSermonBody, listSermons, type SermonMeta } from '../store/sermon';
import { decryptText } from '../vault/cipher';

export { listSermons, type SermonMeta };

/** Decrypted (masked) text of one sermon, or null when it does not exist. */
export async function readSermonText(id: string, opts: { db?: IDBDatabase; key?: CryptoKey } = {}): Promise<string | null> {
  const body = await getSermonBody(id, opts.db);
  if (!body) return null;
  return decryptText(body.ciphertext, body.iv, opts.key);
}

const DELETE_ATTEMPTS = 3;

/**
 * Delete a sermon (meta, body, chunks, style profiles) and remove its excerpt blocks from every
 * outline that cites it, all in one transaction (DESIGN 3.4, 4.1). Outlines are decrypted and
 * re-encrypted before the transaction; if one is saved in between, the whole thing is retried.
 */
export async function deleteSermon(id: string, opts: { db?: IDBDatabase; key?: CryptoKey } = {}): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const updates = await outlineUpdatesForSermonDeletion(id, opts);
    try {
      await deleteSermonStores(id, opts.db, updates);
      return;
    } catch (err) {
      if (!(err instanceof StaleOutlineError) || attempt >= DELETE_ATTEMPTS) throw err;
    }
  }
}
