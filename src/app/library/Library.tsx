// Everyday Illustrations · Light Remarks (DESIGN 3.5): user-written items, plain storage.
// Opened from the action bar with ?ref=&kind= (verse filter), or from Home without filters.
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { formatReference, parseReference, parseStoredRefs, type Reference } from '../../core/bible';
import {
  deleteLibraryItem,
  LIBRARY_BODY_MAX,
  LIBRARY_KINDS,
  LIBRARY_TAG_MAX,
  LIBRARY_TAGS_MAX,
  listLibraryItems,
  saveLibraryItem,
  searchLibrary,
  type LibraryError,
  type LibraryItem,
  type LibraryKind,
} from '../../core/compose';
import { t, useLanguage, type Lang } from '../../i18n';
import { ChoiceGroup } from '../../ui/ChoiceGroup';

type KindFilter = LibraryKind | 'all';

const isKind = (v: string | undefined): v is LibraryKind => (LIBRARY_KINDS as readonly string[]).includes(v ?? '');
const refsLabel = (refs: string[], lang: Lang, sep = ', ') => parseStoredRefs(refs).map((r) => formatReference(r, lang)).join(sep);
const splitTags = (v: string) => v.split(/[,，\s]+/).filter(Boolean);

export function Library({ refParam, kindParam }: { refParam?: string; kindParam?: string }) {
  const lang = useLanguage();
  const id = useId();
  const initialRef = (() => {
    const p = refParam ? parseReference(refParam) : null;
    return p?.ok ? p.ref : null;
  })();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<KindFilter>(isKind(kindParam) ? kindParam : 'all');
  const [ref, setRef] = useState<Reference | null>(initialRef);
  const [tag, setTag] = useState('');
  const [editing, setEditing] = useState<LibraryItem | 'new' | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const reload = useCallback(() => {
    listLibraryItems().then(setItems, () => setFailed(true));
  }, []);
  useEffect(reload, [reload]);

  const hits = items ? searchLibrary(items, { kind: kind === 'all' ? undefined : kind, ref: ref ?? undefined, tag: tag || undefined }) : [];

  const remove = async (itemId: string) => {
    try {
      await deleteLibraryItem(itemId);
      setConfirming(null);
      setMessage(t('library.deleted'));
      reload();
    } catch {
      setFailed(true);
    }
  };

  if (editing)
    return (
      <ItemForm
        item={editing === 'new' ? null : editing}
        defaultKind={kind === 'all' ? 'example' : kind}
        defaultRef={ref && refParam ? formatReference(ref, lang) : ''}
        onDone={(saved) => {
          setEditing(null);
          if (saved) {
            setMessage(t('library.saved'));
            reload();
          }
        }}
      />
    );

  const kindOptions = [{ value: 'all' as KindFilter, label: t('library.kind_all') }, ...LIBRARY_KINDS.map((k) => ({ value: k as KindFilter, label: t(`library.kind.${k}`) }))];

  return (
    <div className="library" data-testid="library">
      <h2 className="page__title">{t('library.title')}</h2>
      <p className="card__muted">{t('library.intro')}</p>
      <button type="button" className="button sermons__add" onClick={() => setEditing('new')} data-testid="library-add">
        {t('library.add')}
      </button>
      <p className="sermons__status" role="status" data-testid="library-status">
        {message}
      </p>
      {failed && (
        <p className="field__error" role="alert">
          {t('common.load_failed')}
        </p>
      )}

      {items && items.length === 0 && (
        <div className="card" data-testid="library-empty">
          <p className="card__title">{t('library.empty')}</p>
          <p>{t('library.empty_howto')}</p>
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <p id={`${id}-kind`} className="field__label">
            {t('library.kind_label')}
          </p>
          <ChoiceGroup labelledBy={`${id}-kind`} testId="library-kind" value={kind} options={kindOptions} onChange={setKind} />
          {ref && (
            <div className="library__filter">
              <p className="card__ref" data-testid="library-ref">
                {t('library.ref_filter', { ref: formatReference(ref, lang) })}
              </p>
              <button type="button" className="button button--secondary" onClick={() => setRef(null)} data-testid="library-ref-clear">
                {t('library.ref_clear')}
              </button>
            </div>
          )}
          <label htmlFor={`${id}-tag`} className="field__label">
            {t('library.tag_search_label')}
          </label>
          <input
            id={`${id}-tag`}
            className="field__input"
            type="search"
            autoComplete="off"
            maxLength={LIBRARY_TAG_MAX}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            data-testid="library-tag"
          />
          {hits.length === 0 ? (
            <p className="card__muted" data-testid="library-no-match">
              {t('library.no_match')}
            </p>
          ) : (
            <>
              <p className="card__muted">{t('library.count', { n: hits.length })}</p>
              <ul className="sermon-list" data-testid="library-list">
                {hits.map(({ item, match }) => (
                  <li key={item.id} className="sermon-list__item" data-testid="library-item">
                    <p className="excerpts__from">
                      {t(`library.kind.${item.kind}`)}
                      {match !== 'none' && ` · ${t(`library.match.${match}`)}`}
                    </p>
                    <p className="library__body">{item.body}</p>
                    {(item.verse_refs.length > 0 || item.tags.length > 0) && (
                      <p className="card__muted">{[refsLabel(item.verse_refs, lang), ...item.tags.map((x) => `#${x}`)].filter(Boolean).join(' ')}</p>
                    )}
                    {confirming === item.id ? (
                      <div className="sermon-list__confirm" role="alertdialog" aria-label={t('common.delete')}>
                        <p>{t('library.delete_confirm')}</p>
                        <div className="sermons__actions">
                          <button type="button" className="button" onClick={() => void remove(item.id)} data-testid="library-delete-yes">
                            {t('common.delete_yes')}
                          </button>
                          <button type="button" className="button button--secondary" onClick={() => setConfirming(null)}>
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="sermons__actions">
                        <button type="button" className="button button--secondary" onClick={() => setEditing(item)} data-testid="library-edit">
                          {t('common.edit')}
                        </button>
                        <button type="button" className="button button--secondary" onClick={() => setConfirming(item.id)} data-testid="library-delete">
                          {t('common.delete')}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ItemForm({ item, defaultKind, defaultRef, onDone }: { item: LibraryItem | null; defaultKind: LibraryKind; defaultRef: string; onDone: (saved: boolean) => void }) {
  const lang = useLanguage();
  const id = useId();
  const [kind, setKind] = useState<LibraryKind>(item?.kind ?? defaultKind);
  const [body, setBody] = useState(item?.body ?? '');
  const [refText, setRefText] = useState(item ? refsLabel(item.verse_refs, lang, '; ') : defaultRef);
  const [tags, setTags] = useState(item?.tags.join(', ') ?? '');
  const [errors, setErrors] = useState<LibraryError[]>([]);
  const [failed, setFailed] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      // Several references can be separated with ";" (a single reference may contain commas).
      const r = await saveLibraryItem({ id: item?.id, kind, body, refs: refText.split(/[;\n]/), tags: splitTags(tags) });
      if (r.ok) onDone(true);
      else setErrors(r.errors);
    } catch {
      setFailed(true);
    }
  };

  return (
    <form className="library__form" onSubmit={(e) => void submit(e)} noValidate data-testid="library-form">
      <h2 className="page__title">{item ? t('common.edit') : t('library.add')}</h2>
      <p id={`${id}-kind`} className="field__label">
        {t('library.kind_label')}
      </p>
      <ChoiceGroup
        labelledBy={`${id}-kind`}
        testId="library-form-kind"
        value={kind}
        options={LIBRARY_KINDS.map((k) => ({ value: k, label: t(`library.kind.${k}`) }))}
        onChange={setKind}
      />
      <label htmlFor={`${id}-body`} className="field__label">
        {t('library.body_label')}
      </label>
      <textarea
        id={`${id}-body`}
        className="field__input field__textarea"
        maxLength={LIBRARY_BODY_MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        data-testid="library-form-body"
      />
      <label htmlFor={`${id}-ref`} className="field__label">
        {t('library.ref_label')}
      </label>
      <input id={`${id}-ref`} className="field__input" autoComplete="off" maxLength={120} value={refText} onChange={(e) => setRefText(e.target.value)} data-testid="library-form-ref" />
      <label htmlFor={`${id}-tags`} className="field__label">
        {t('library.tags_label')}
      </label>
      <input id={`${id}-tags`} className="field__input" autoComplete="off" maxLength={200} value={tags} onChange={(e) => setTags(e.target.value)} data-testid="library-form-tags" />
      {errors.map((er) => (
        <p key={er} className="field__error" role="alert" data-testid={`library-error-${er}`}>
          {t(`library.error.${er}`, { max: LIBRARY_BODY_MAX, count: LIBRARY_TAGS_MAX, len: LIBRARY_TAG_MAX })}
        </p>
      ))}
      {failed && (
        <p className="field__error" role="alert">
          {t('common.save_failed')}
        </p>
      )}
      <div className="sermons__actions">
        <button type="submit" className="button" data-testid="library-form-save">
          {t('library.save')}
        </button>
        <button type="button" className="button button--secondary" onClick={() => onDone(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
