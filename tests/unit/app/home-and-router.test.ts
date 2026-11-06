import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import appConfig from '../../../config/app.config.json';
import { applyFontSize } from '../../../src/app/font-size';
import { parseHash, routeHref } from '../../../src/app/router';
import { availableBibleIds } from '../../../src/core/bible/db';
import { parseReference } from '../../../src/core/bible/reference-parser';
import { BibleRepository } from '../../../src/core/bible/repository';

describe('home.daily_verses (DESIGN ch. 8)', () => {
  it('every reference parses and exists in krv and kjv', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database(readFileSync(appConfig.bible_db.file));
    const repo = new BibleRepository(db, availableBibleIds(appConfig));
    for (const ref of appConfig.home.daily_verses) {
      const r = parseReference(ref);
      expect(r.ok, ref).toBe(true);
      if (!r.ok) continue;
      for (const bible of ['krv', 'kjv']) {
        expect(repo.checkReference(bible, r.ref), `${ref} ${bible}`).toBeNull();
        expect(repo.getVerses(bible, r.ref).length, `${ref} ${bible}`).toBeGreaterThan(0);
      }
    }
    db.close();
  });
});

describe('router', () => {
  it('parses hashes and builds hrefs', () => {
    expect(parseHash('').name).toBe('home');
    expect(parseHash('#/').name).toBe('home');
    expect(parseHash('#/settings').name).toBe('settings');
    expect(parseHash('#/unknown').name).toBe('home');
    const r = parseHash(`#/read?${new URLSearchParams({ ref: 'JHN 3:16' })}`);
    expect(r.name).toBe('read');
    expect(r.params.get('ref')).toBe('JHN 3:16');
    expect(routeHref('home')).toBe('#/');
    expect(routeHref('search', { q: '사랑' })).toBe('#/search?q=%EC%82%AC%EB%9E%91');
    expect(parseHash(routeHref('search', { q: '사랑' })).params.get('q')).toBe('사랑');
  });
});

describe('applyFontSize', () => {
  it('sets only the root font size in px', () => {
    const el = document.createElement('html');
    applyFontSize(22, el);
    expect(el.style.fontSize).toBe('22px');
  });
});
