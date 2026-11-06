// Browser loader for the bundled DB (skill bible-db-access §4.3, DESIGN 10장).
// sql.js and its WASM come from our own build output (no CDN). The DB file is fetched from the
// same origin on first use and opened once; the service worker precaches both for offline use.
// The first screen never waits for this (lazy loading).
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { bible_db, i18n } from '../../../config/app.config.json';
import { BibleRepository } from './repository';

/** `public/data/bible.sqlite` → `<base>data/bible.sqlite` (files under public/ are served from the base). */
export function publicPath(file: string, base: string): string {
  return base + file.replace(/^public\//, '');
}

export function availableBibleIds(cfg: { i18n: { available_bibles: Record<string, string[]> } }): string[] {
  return [...new Set(Object.values(cfg.i18n.available_bibles).flat())];
}

let pending: Promise<BibleRepository> | null = null;

export function loadBible(): Promise<BibleRepository> {
  pending ??= (async () => {
    const [SQL, res] = await Promise.all([
      initSqlJs({ locateFile: () => wasmUrl }),
      fetch(publicPath(bible_db.file, import.meta.env.BASE_URL)),
    ]);
    if (!res.ok) throw new Error(`bible db: HTTP ${res.status}`);
    const db = new SQL.Database(new Uint8Array(await res.arrayBuffer()));
    return new BibleRepository(db, availableBibleIds({ i18n }));
  })().catch((err: unknown) => {
    pending = null; // allow a retry (e.g. first visit while offline)
    throw err;
  });
  return pending;
}
