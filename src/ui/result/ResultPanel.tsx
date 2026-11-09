// Generation result (DESIGN 3.7, 6.2; CLAUDE.md rules 9, 15). Text nodes only: model output never
// becomes HTML. [[QUOTE ref]] markers are filled with the bundled DB text and shown as quotes; the
// model's own words never stand in for Scripture. The AI-draft notice sits at the top and bottom,
// followed by "send by email" and "save as txt" (ResultExport).
import { Fragment } from 'react';
import { formatReference, parseReference, type Verse } from '../../core/bible';
import { splitQuotes, type GenerationOutput } from '../../core/validate';
import { routeHref } from '../../app/router';
import { t } from '../../i18n';
import { ResultExport } from './ResultExport';
import { quoteText } from './resultText';

type Lang = 'ko' | 'en';

interface Props {
  output: GenerationOutput;
  humorDropped: boolean;
  verses: readonly Verse[];
  bibleId: string;
  lang: Lang;
  /** The passage the result was made for (file name, email subject). */
  refText: string;
  fromCache?: boolean;
  /** On-device AI (S15): show only this section. */
  only?: 'sermon' | 'examples' | 'humor';
}

function RefLink({ refText, lang }: { refText: string; lang: Lang }) {
  const p = parseReference(refText);
  if (!p.ok) return null;
  return (
    <a className="result__ref" href={routeHref('read', { ref: refText })} data-testid="result-ref">
      {formatReference(p.ref, lang)}
    </a>
  );
}

function Refs({ refs, lang }: { refs: readonly string[]; lang: Lang }) {
  if (refs.length === 0) return null;
  return (
    <p className="result__refs" data-testid="result-refs">
      <span className="result__refs-label">{t('result.verse_refs')}</span>
      {refs.map((r, i) => (
        <Fragment key={`${r}-${i}`}>
          {i > 0 && ', '}
          <RefLink refText={r} lang={lang} />
        </Fragment>
      ))}
    </p>
  );
}

/** Model text with quote markers replaced by bundled-text quote blocks. */
function RichText({ text, verses, bibleId, lang, testId }: { text: string; verses: readonly Verse[]; bibleId: string; lang: Lang; testId: string }) {
  return (
    <div className="result__text" data-testid={testId}>
      {splitQuotes(text).map((seg, i) => {
        if (seg.kind === 'text')
          return seg.text
            .split(/\n+/)
            .map((para) => para.trim())
            .filter(Boolean)
            .map((para, j) => <p key={`${i}-${j}`}>{para}</p>);
        const quoted = quoteText(seg.ref, verses);
        if (!quoted) return null;
        return (
          <blockquote key={i} className="quote quote--bible" data-testid="result-quote">
            <p className="quote__label">
              {t('result.quote', { bible: t(`bible.${bibleId}`) })} · <RefLink refText={seg.ref} lang={lang} />
            </p>
            <p className="quote__text">{quoted}</p>
          </blockquote>
        );
      })}
    </div>
  );
}

function AiNotice({ testId }: { testId: string }) {
  return (
    <p className="result__notice" role="note" data-testid={testId}>
      {t('result.ai_notice')}
    </p>
  );
}

export function ResultPanel({ output, humorDropped, verses, bibleId, lang, refText, fromCache, only }: Props) {
  return (
    <article className="result" data-testid="result-panel">
      <AiNotice testId="result-notice-top" />
      {fromCache && (
        <p className="card__muted" data-testid="result-from-cache">
          {t('result.from_cache')}
        </p>
      )}

      {(!only || only === 'sermon') && (
        <section className="card" aria-labelledby="result-sermon">
          <h3 id="result-sermon" className="card__title">
            {t('result.sermon')}
          </h3>
          <h4 className="result__title" data-testid="result-title">
            {output.sermon.title}
          </h4>
          <RichText text={output.sermon.body} verses={verses} bibleId={bibleId} lang={lang} testId="result-body" />
          <Refs refs={output.sermon.verse_refs} lang={lang} />
        </section>
      )}

      {(!only || only === 'examples') && (
        <section className="card" aria-labelledby="result-examples">
          <h3 id="result-examples" className="card__title">
            {t('result.examples')}
          </h3>
          <ol className="result__list">
            {output.examples.map((e, i) => (
              <li key={i} className="result__item" data-testid="result-example">
                <RichText text={e.text} verses={verses} bibleId={bibleId} lang={lang} testId="result-example-text" />
                <Refs refs={e.verse_refs} lang={lang} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {(!only || only === 'humor') && (
        <section className="card" aria-labelledby="result-humor">
          <h3 id="result-humor" className="card__title">
            {t('result.humor')}
          </h3>
          {humorDropped || output.humor.length === 0 ? (
            <p className="card__muted" data-testid="result-humor-dropped">
              {t('result.humor_dropped')}
            </p>
          ) : (
            <ul className="result__list">
              {output.humor.map((h, i) => (
                <li key={i} className="result__item" data-testid="result-humor">
                  <p>{h.text}</p>
                  {h.purpose.trim() && <p className="card__muted">{t('result.purpose', { purpose: h.purpose })}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <AiNotice testId="result-notice-bottom" />
      <ResultExport output={output} humorDropped={humorDropped} verses={verses} bibleId={bibleId} lang={lang} refText={refText} only={only} />
    </article>
  );
}
