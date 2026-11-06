// Message Outline (DESIGN 3.4): list of saved outlines, and the editor for a new (from a
// selection) or saved outline. Quote blocks are read-only and visibly different from blanks;
// on save only the user's blanks are copy-checked (a warning, the outline is still saved).
import { useCallback, useEffect, useId, useState } from 'react';
import { formatReference, parseReference } from '../../core/bible';
import {
  checkOutlineCopies,
  createOutline,
  deleteOutline,
  listOutlines,
  openOutline,
  outlineTitle,
  removeExcerpt,
  saveOutline,
  setBlockText,
  type Outline as OutlineModel,
  type OutlineBlock,
  type OutlineMeta,
} from '../../core/compose';
import { t, useLanguage, type Lang } from '../../i18n';
import { bundledBible, usePreferences } from '../preferences';
import { navigate } from '../router';
import { useBible } from '../useBible';
import { readHandOff } from './handoff';
import { useBackHandler } from '../back';

const refLabel = (ref: string, lang: Lang) => {
  const p = parseReference(ref);
  return p.ok ? formatReference(p.ref, lang, 'long') : ref;
};

export function Outline({ refParam, idParam, pickParam }: { refParam?: string; idParam?: string; pickParam?: string }) {
  if (idParam) return <OpenSaved id={idParam} />;
  if (refParam) return <CreateNew refText={refParam} pick={pickParam} />;
  return <OutlineList />;
}

function OutlineList() {
  const lang = useLanguage();
  const [items, setItems] = useState<OutlineMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  useBackHandler(confirming !== null, () => setConfirming(null));
  const [message, setMessage] = useState('');
  const reload = useCallback(() => {
    listOutlines().then(setItems, () => setFailed(true));
  }, []);
  useEffect(reload, [reload]);
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US');
  const name = (m: OutlineMeta) => m.title || t('outline.untitled');

  const remove = async (id: string) => {
    try {
      await deleteOutline(id);
      setConfirming(null);
      setMessage(t('outline.deleted'));
      reload();
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="outlines" data-testid="outline-list">
      <h2 className="page__title">{t('outline.title')}</h2>
      <p className="card__muted">{t('outline.list_intro')}</p>
      <p className="sermons__status" role="status" data-testid="outline-status">
        {message}
      </p>
      {failed && (
        <p className="field__error" role="alert">
          {t('common.load_failed')}
        </p>
      )}
      {items && items.length === 0 && (
        <p className="card__muted" data-testid="outline-empty">
          {t('outline.list_empty')}
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="sermon-list">
          {items.map((m) => (
            <li key={m.id} className="sermon-list__item" data-testid="outline-item">
              <div className="sermon-list__head">
                <div className="sermon-list__text">
                  <p className="sermon-list__title">{name(m)}</p>
                  <p className="card__muted">
                    {refLabel(m.ref, lang)} · {t('common.saved_on', { date: date(m.updated_at) })}
                  </p>
                </div>
              </div>
              {confirming === m.id ? (
                <div className="sermon-list__confirm" role="alertdialog" aria-label={t('common.delete')}>
                  <p>{t('outline.delete_confirm', { title: name(m) })}</p>
                  <div className="sermons__actions">
                    <button type="button" className="button" onClick={() => void remove(m.id)} data-testid="outline-delete-yes">
                      {t('common.delete_yes')}
                    </button>
                    <button type="button" className="button button--secondary" onClick={() => setConfirming(null)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sermons__actions">
                  <button type="button" className="button" onClick={() => navigate('outline', { id: m.id })} data-testid="outline-open">
                    {t('outline.open')}
                  </button>
                  <button type="button" className="button button--secondary" onClick={() => setConfirming(m.id)} data-testid="outline-delete">
                    {t('common.delete')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateNew({ refText, pick }: { refText: string; pick?: string }) {
  const bible = bundledBible(usePreferences());
  const { load } = useBible();
  const excerpts = readHandOff(pick, refText);
  const parsed = parseReference(refText);
  if (!parsed.ok || parsed.ref.ranges.length === 0) {
    return (
      <p className="field__error" role="alert">
        {t('common.bad_ref')}
      </p>
    );
  }
  if (load.state === 'loading') return <p className="card__muted">{t('common.loading')}</p>;
  if (load.state === 'failed') return <p className="field__error">{t('common.load_failed')}</p>;
  const verses = load.repo.getVerses(bible, parsed.ref);
  if (verses.length === 0) return <p className="field__error">{t('common.bad_ref')}</p>;
  return <Editor initial={createOutline({ ref: refText, bibleId: bible, verses, excerpts })} isNew />;
}

function OpenSaved({ id }: { id: string }) {
  const [state, setState] = useState<{ s: 'loading' } | { s: 'missing' } | { s: 'ready'; o: OutlineModel }>({ s: 'loading' });
  useEffect(() => {
    openOutline(id).then(
      (o) => setState(o ? { s: 'ready', o } : { s: 'missing' }),
      () => setState({ s: 'missing' }),
    );
  }, [id]);
  if (state.s === 'loading') return <p className="card__muted">{t('common.loading')}</p>;
  if (state.s === 'missing')
    return (
      <>
        <p className="field__error" role="alert">
          {t('outline.not_found')}
        </p>
        <button type="button" className="button button--secondary" onClick={() => navigate('outline')}>
          {t('outline.to_list')}
        </button>
      </>
    );
  return <Editor initial={state.o} isNew={false} />;
}

function Editor({ initial, isNew }: { initial: OutlineModel; isNew: boolean }) {
  const lang = useLanguage();
  const id = useId();
  const [outline, setOutline] = useState(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [warned, setWarned] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(!isNew);

  const edit = (o: OutlineModel) => {
    setOutline(o);
    if (status === 'saved') setStatus('idle');
  };

  const save = async () => {
    setStatus('saving');
    const copies = checkOutlineCopies(outline);
    setWarned(new Set(copies.map((c) => c.blockId)));
    try {
      setOutline(await saveOutline(outline));
      setSaved(true);
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  };

  const blockView = (sectionKey: string, b: OutlineBlock) => {
    if (b.kind === 'quote_bible')
      return (
        <blockquote key={b.id} className="quote quote--bible" data-testid="outline-quote-bible">
          <p className="quote__label">{t('outline.quote_bible', { ref: refLabel(b.source?.ref ?? outline.ref, lang) })}</p>
          <p className="quote__text">{b.text}</p>
        </blockquote>
      );
    if (b.kind === 'quote_excerpt')
      return (
        <blockquote key={b.id} className="quote quote--excerpt" data-testid="outline-quote-excerpt">
          <p className="quote__label">{t('outline.quote_excerpt', { title: b.source?.sermon_title ?? '' })}</p>
          <p className="quote__text">{b.text}</p>
          <button type="button" className="button button--secondary quote__remove" onClick={() => edit(removeExcerpt(outline, b.id))} data-testid="outline-remove-excerpt">
            {t('outline.remove_excerpt')}
          </button>
        </blockquote>
      );
    const section = t(`outline.section.${sectionKey}`);
    const single = sectionKey === 'title';
    return (
      <div key={b.id} className="blank">
        <label htmlFor={`${id}-${b.id}`} className="field__label">
          {t('outline.blank_label', { section })}
        </label>
        {single ? (
          <input
            id={`${id}-${b.id}`}
            className="field__input blank__input"
            autoComplete="off"
            maxLength={80}
            placeholder={t('outline.blank_placeholder')}
            value={b.text}
            onChange={(e) => edit(setBlockText(outline, b.id, e.target.value))}
            data-testid={`outline-blank-${sectionKey}`}
          />
        ) : (
          <textarea
            id={`${id}-${b.id}`}
            className="field__input field__textarea blank__input"
            placeholder={t('outline.blank_placeholder')}
            value={b.text}
            onChange={(e) => edit(setBlockText(outline, b.id, e.target.value))}
            aria-invalid={warned.has(b.id) || undefined}
            data-testid={`outline-blank-${sectionKey}`}
          />
        )}
      </div>
    );
  };

  return (
    <div className="outline" data-testid="outline-editor">
      <h2 className="page__title">{t('outline.title')}</h2>
      <p className="card__ref" data-testid="outline-ref">
        {outlineTitle(outline) || refLabel(outline.ref, lang)}
      </p>
      <p className="card__muted">{t('outline.editor_note')}</p>
      {outline.sections.map((s) => (
        <section key={s.key} className="outline__section" aria-labelledby={`${id}-${s.key}`} data-testid={`outline-section-${s.key}`}>
          <h3 id={`${id}-${s.key}`} className="outline__heading">
            {t(`outline.section.${s.key}`)}
          </h3>
          {s.blocks.map((b) => blockView(s.key, b))}
        </section>
      ))}
      <div aria-live="polite">
        {status === 'saved' && (
          <p className="sermons__status" role="status" data-testid="outline-saved">
            {t('outline.saved')}
          </p>
        )}
        {status === 'failed' && (
          <p className="field__error" role="alert">
            {t('common.save_failed')}
          </p>
        )}
        {warned.size > 0 && (
          <p className="field__error" data-testid="outline-copy-warning">
            {t('outline.copy_warning')}
          </p>
        )}
      </div>
      <div className="sermons__actions">
        <button type="button" className="button" disabled={status === 'saving'} onClick={() => void save()} data-testid="outline-save">
          {t('outline.save')}
        </button>
        {saved && (
          <button type="button" className="button button--secondary" onClick={() => navigate('outline')} data-testid="outline-to-list">
            {t('outline.to_list')}
          </button>
        )}
      </div>
    </div>
  );
}
