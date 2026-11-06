// Lazy DB loading for screens (DESIGN ch. 10: the first screen never waits for the DB).
// useBible: the bundled DB (quotes, outlines, requests always use it — CLAUDE.md rule 15).
// useReader: what the reader shows — the bundled DB or an imported bible (S11), loaded from
// IndexedDB once and kept in memory while the app is open.
import { useCallback, useEffect, useState } from 'react';
import { isImportedBibleId, loadImportedRepository, type ImportedRepository } from '../core/bible-import';
import { loadBible, type BibleRepository, type BibleSource } from '../core/bible';

export type BibleLoad = { state: 'loading' } | { state: 'ready'; repo: BibleRepository } | { state: 'failed' };
export type ReaderLoad = { state: 'loading' } | { state: 'ready'; repo: BibleSource } | { state: 'failed' };

export function useBible(): { load: BibleLoad; retry: () => void } {
  const [load, setLoad] = useState<BibleLoad>({ state: 'loading' });

  const open = useCallback(() => {
    loadBible().then(
      (repo) => setLoad({ state: 'ready', repo }),
      () => setLoad({ state: 'failed' }),
    );
  }, []);

  useEffect(open, [open]);

  const retry = useCallback(() => {
    setLoad({ state: 'loading' });
    open();
  }, [open]);

  return { load, retry };
}

const importedCache = new Map<string, Promise<ImportedRepository>>();

function loadImported(id: string): Promise<ImportedRepository> {
  let p = importedCache.get(id);
  if (!p) {
    p = loadImportedRepository(id).catch((err: unknown) => {
      importedCache.delete(id);
      throw err;
    });
    importedCache.set(id, p);
  }
  return p;
}

/** Drop the in-memory copy of an imported bible (after it is deleted); no id: all of them
 *  (after a backup import may have replaced some). */
export function forgetImportedBible(id?: string): void {
  if (id === undefined) importedCache.clear();
  else importedCache.delete(id);
}

export function useReader(bible: string): { load: ReaderLoad; retry: () => void } {
  const [state, setState] = useState<{ bible: string; load: ReaderLoad }>({ bible, load: { state: 'loading' } });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const source: Promise<BibleSource> = isImportedBibleId(bible) ? loadImported(bible) : loadBible();
    source.then(
      (repo) => live && setState({ bible, load: { state: 'ready', repo } }),
      () => live && setState({ bible, load: { state: 'failed' } }),
    );
    return () => {
      live = false;
    };
  }, [bible, attempt]);

  const retry = useCallback(() => {
    setState({ bible, load: { state: 'loading' } });
    setAttempt((n) => n + 1);
  }, [bible]);

  // A different bible than the loaded one is still loading.
  return { load: state.bible === bible ? state.load : { state: 'loading' }, retry };
}
