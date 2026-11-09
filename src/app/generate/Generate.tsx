// Everyday examples / light remarks with an AI connection (DESIGN 3.7, 4.4; S09).
// Not connected → the library screen (examples, remarks) or, for the Reflection Draft (S12), a
// notice offering "connect AI" or "use the outline"; nothing is sent. Connected → the transfer notice (unless turned
// off in settings) → one request (at most one retry) → validated result or the independent result.
// The request can be cancelled at any time; leaving the screen cancels it too.
// No key connected and on-device AI turned on and ready (S15): the same screen, but the answer is
// made on the phone (core/generate/device.ts), one section at a time, and only that section is shown.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { parseReference, type Reference, type Verse } from '../../core/bible';
import { isImportedBibleId } from '../../core/bible-import';
import { activeStyleProfileText, generate, generateOnDevice, type GenerateOutcome } from '../../core/generate';
import { connectedClient, DEVICE_KINDS, DEVICE_PROVIDER, deviceAiBridge, deviceClient, deviceModel, getConnection, remainingToday, type Connection } from '../../core/llm';
import type { Persona } from '../../core/persona';
import { queryKeywords, searchMySermons } from '../../core/sermon';
import { getActivePersona, hasConsent } from '../../core/store';
import { t, useLanguage } from '../../i18n';
import { FallbackView } from '../../ui/result/FallbackView';
import { ResultPanel } from '../../ui/result/ResultPanel';
import { bundledBible, usePreferences } from '../preferences';
import { navigate } from '../router';
import { useBible, useReader } from '../useBible';
import { useBackHandler } from '../back';

type Kind = 'sermon' | 'example' | 'one_liner';
/** Library kind shown first in the independent result (the draft has no library of its own). */
const libraryKind = (k: Kind) => (k === 'one_liner' ? 'one_liner' : 'example');

interface Context {
  /** 'device': on-device AI, no key (S15). */
  mode: 'provider' | 'device';
  conn: Connection;
  persona: Persona | null;
  consent: boolean;
  remaining: number;
  /** Fresh style profile block (S10); null when none, stale, or without the transfer consent. */
  style: string | null;
}

type Phase = { p: 'confirm' } | { p: 'sending' } | { p: 'cancelled' } | { p: 'done'; outcome: Exclude<GenerateOutcome, { kind: 'cancelled' }> };

const splitWords = (v: string) =>
  [
    ...new Set(
      v
        .split(/[,\s]+/)
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ].slice(0, 5);

export function Generate({ refParam, kindParam }: { refParam: string; kindParam?: string }) {
  const kind: Kind = kindParam === 'sermon' ? 'sermon' : kindParam === 'example' ? 'example' : 'one_liner';
  const lang = useLanguage();
  const parsed = useMemo(() => parseReference(refParam), [refParam]);
  const [ctx, setCtx] = useState<Context | null | undefined>(undefined);
  const [noConnection, setNoConnection] = useState(false);
  const [deviceNote, setDeviceNote] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const conn = await getConnection();
      if (!conn) {
        if (!DEVICE_KINDS.includes(kind) || !(await deviceClient())) return null;
        // The persona stays on the phone; the draft follows it.
        const persona = kind === 'sermon' ? await getActivePersona().catch(() => null) : null;
        const device: Context = {
          mode: 'device',
          conn: {
            provider: DEVICE_PROVIDER,
            model: deviceModel(),
            key_last4: '',
          },
          persona,
          consent: false,
          remaining: 0,
          style: null,
        };
        return device;
      }
      const [persona, consent, remaining] = await Promise.all([
        getActivePersona().catch(() => null),
        hasConsent('external_transfer', conn.provider).catch(() => false),
        remainingToday().catch(() => 0),
      ]);
      // The profile came from the sermons: it goes out only with the same transfer consent.
      const style = consent ? await activeStyleProfileText(lang).catch(() => null) : null;
      return {
        mode: 'provider' as const,
        conn,
        persona,
        consent,
        remaining,
        style,
      };
    })()
      .catch(() => null)
      .then((c) => {
        if (!live) return;
        // Without a connection: no request at all. The draft explains the choices; the others open the library.
        if (!c && kind === 'sermon') {
          setNoConnection(true);
          // In the app with the plugin: say what on-device AI can do and where to turn it on.
          if (deviceAiBridge()) setDeviceNote(true);
        } else if (!c) navigate('library', { ref: refParam, kind }, { replace: true });
        else setCtx(c);
      });
    return () => {
      live = false;
    };
  }, [refParam, kind, lang]);

  if (!parsed.ok || parsed.ref.ranges.length === 0) {
    return (
      <p className="field__error" role="alert">
        {t('common.bad_ref')}
      </p>
    );
  }
  if (noConnection) return <NoConnection refText={refParam} deviceNote={deviceNote} />;
  if (!ctx) return <p className="card__muted">{t('common.loading')}</p>;
  return <GenerateWithBible refText={refParam} reference={parsed.ref} kind={kind} ctx={ctx} />;
}

function GenerateWithBible(props: { refText: string; reference: Reference; kind: Kind; ctx: Context }) {
  const prefs = usePreferences();
  // The request always carries the bundled text (rule 15). While an imported bible is being read,
  // its text of the passage is only a copy-check source here; it is never sent (S11).
  const bible = bundledBible(prefs);
  const reading = prefs.bible_id;
  const imported = isImportedBibleId(reading);
  const { load } = useBible();
  const { load: readerLoad } = useReader(reading);
  if (load.state === 'loading' || (imported && readerLoad.state === 'loading')) return <p className="card__muted">{t('common.loading')}</p>;
  if (load.state === 'failed')
    return (
      <p className="field__error" role="alert">
        {t('common.load_failed')}
      </p>
    );
  const verses = load.repo.getVerses(bible, props.reference);
  const importedVerses = imported && readerLoad.state === 'ready' ? readerLoad.repo.getVerses(reading, props.reference) : [];
  return <GenerateScreen {...props} bibleId={bible} verses={verses} imported={imported} importedVerses={importedVerses} />;
}

interface ScreenProps {
  refText: string;
  reference: Reference;
  kind: Kind;
  ctx: Context;
  bibleId: string;
  verses: Verse[];
  imported: boolean;
  importedVerses: Verse[];
}

function GenerateScreen({ refText, reference, kind, ctx, bibleId, verses, imported, importedVerses }: ScreenProps) {
  const id = useId();
  const lang = useLanguage();
  const prefs = usePreferences();
  const [words, setWords] = useState(() => queryKeywords(verses.map((v) => v.text).join(' ')).join(', '));
  const [phase, setPhase] = useState<Phase>({ p: 'confirm' });
  const controller = useRef<AbortController | null>(null);
  // Back key while sending: stop the request (same as the cancel button).
  useBackHandler(phase.p === 'sending', () => controller.current?.abort());
  const autoSent = useRef(false);

  useEffect(() => () => controller.current?.abort(), []);

  const send = useCallback(async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setPhase({ p: 'sending' });
    const keywords = splitWords(words);
    try {
      if (ctx.mode === 'device') {
        const client = await deviceClient();
        if (!client) return navigate('library', { ref: refText, kind: libraryKind(kind) }, { replace: true });
        const outcome = await generateOnDevice(
          {
            kind,
            lang,
            bibleId,
            refs: [reference],
            verses,
            keywords,
            persona: ctx.persona,
            excerpts: [],
            transferConsent: false,
            extraCopySources: importedVerses.map((v) => ({
              id: `imported:${v.book}:${v.chapter}:${v.verse}`,
              text: v.text,
            })),
            libraryKind: libraryKind(kind),
          },
          { client, model: ctx.conn.model, signal: c.signal },
        );
        if (c.signal.aborted && outcome.kind !== 'cancelled') return;
        setPhase(outcome.kind === 'cancelled' ? { p: 'cancelled' } : { p: 'done', outcome });
        return;
      }
      const client = await connectedClient();
      if (!client) return navigate('library', { ref: refText, kind: libraryKind(kind) }, { replace: true });
      // Excerpts are searched on the device and sent only with the transfer consent (DESIGN 4.4).
      const excerpts = ctx.consent ? await searchMySermons({ refs: [reference], keywords }).catch(() => []) : [];
      const outcome = await generate(
        {
          lang,
          bibleId,
          refs: [reference],
          verses,
          keywords,
          persona: ctx.persona,
          styleProfile: ctx.style,
          excerpts: excerpts.map((e) => ({
            sermonId: e.sermonId,
            chunkId: e.chunkId,
            sermonTitle: e.sermonTitle,
            text: e.text,
          })),
          transferConsent: ctx.consent,
          otherTranslation: imported,
          extraCopySources: importedVerses.map((v) => ({
            id: `imported:${v.book}:${v.chapter}:${v.verse}`,
            text: v.text,
          })),
          libraryKind: libraryKind(kind),
        },
        {
          client,
          provider: ctx.conn.provider,
          model: ctx.conn.model,
          signal: c.signal,
        },
      );
      if (c.signal.aborted && outcome.kind !== 'cancelled') return;
      setPhase(outcome.kind === 'cancelled' ? { p: 'cancelled' } : { p: 'done', outcome });
    } catch {
      if (!c.signal.aborted) setPhase({ p: 'cancelled' });
    }
  }, [words, refText, kind, ctx, reference, lang, bibleId, verses, imported, importedVerses]);

  // Notice turned off in settings: send right away (what is sent does not change).
  useEffect(() => {
    if (!prefs.transfer_notice && !autoSent.current) {
      autoSent.current = true;
      void send();
    }
  }, [prefs.transfer_notice, send]);

  const provider = t(`llm.provider_name.${ctx.conn.provider}`);

  if (phase.p === 'sending')
    return (
      <section className="generate" data-testid="generate-sending">
        <p role="status" aria-live="polite" className="generate__status">
          {t(ctx.mode === 'device' ? 'generate.sending_device' : 'generate.sending')}
        </p>
        <button type="button" className="button button--secondary" onClick={() => controller.current?.abort()} data-testid="generate-cancel">
          {t('generate.cancel')}
        </button>
      </section>
    );

  if (phase.p === 'done') {
    const o = phase.outcome;
    return (
      <section className="generate" data-testid="generate">
        <h2 className="page__title">{t('generate.title')}</h2>
        {o.kind === 'result' ? (
          <ResultPanel
            output={o.output}
            humorDropped={o.humorDropped}
            verses={verses}
            bibleId={bibleId}
            lang={lang}
            refText={refText}
            fromCache={o.fromCache}
            only={ctx.mode === 'device' ? (kind === 'sermon' ? 'sermon' : kind === 'example' ? 'examples' : 'humor') : undefined}
          />
        ) : (
          <FallbackView reason={o.reason} independent={o.independent} refText={refText} kind={libraryKind(kind)} provider={ctx.conn.provider} />
        )}
        <button type="button" className="button button--secondary" onClick={() => navigate('read', { ref: refText })} data-testid="generate-back">
          {t('generate.back_to_reading')}
        </button>
      </section>
    );
  }

  return (
    <section className="generate" data-testid="generate-notice" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="page__title">
        {t('generate.notice_title')}
      </h2>
      {phase.p === 'cancelled' && (
        <p role="status" className="card__muted" data-testid="generate-cancelled">
          {t('generate.cancelled')}
        </p>
      )}
      <div className="card">
        {ctx.mode === 'device' ? (
          <>
            <p data-testid="generate-notice-device">{t('generate.device_notice_body')}</p>
            <p className="card__muted">{t('generate.device_notice_wait')}</p>
          </>
        ) : (
          <p data-testid="generate-notice-body">{t(ctx.consent ? 'generate.notice_body_excerpts' : 'generate.notice_body', { provider })}</p>
        )}
        {ctx.style && <p data-testid="generate-notice-style">{t('generate.notice_body_style')}</p>}
        {ctx.conn.provider === 'gemini' && (
          <p className="style-profile__warning" role="note" data-testid="generate-notice-gemini">
            {t('generate.notice_gemini')}
          </p>
        )}
        {imported && <p data-testid="generate-notice-imported">{t('generate.notice_imported', { bible: t(`bible.${bibleId}`) })}</p>}
        <p className="card__muted">{t('generate.notice_keep')}</p>
        <p className="card__muted">{t('generate.notice_settings')}</p>
      </div>
      <label htmlFor={`${id}-kw`} className="field__label">
        {t('generate.keywords_label')}
      </label>
      <input id={`${id}-kw`} className="field__input" value={words} onChange={(e) => setWords(e.target.value)} autoComplete="off" data-testid="generate-keywords" />
      {ctx.mode === 'provider' && (
        <p className="card__muted" data-testid="generate-remaining">
          {t('generate.remaining', { n: ctx.remaining })}
        </p>
      )}
      <div className="sermons__actions">
        <button type="button" className="button" onClick={() => void send()} data-testid="generate-send">
          {t('generate.send')}
        </button>
        <button type="button" className="button button--secondary" onClick={() => navigate('read', { ref: refText })} data-testid="generate-back">
          {t('generate.back_to_reading')}
        </button>
      </div>
    </section>
  );
}

/** Reflection Draft without an AI connection (DESIGN 3.1.1, S12): nothing is sent. */
function NoConnection({ refText, deviceNote }: { refText: string; deviceNote: boolean }) {
  const id = useId();
  return (
    <section className="generate" aria-labelledby={`${id}-h`} data-testid="generate-no-connection">
      <h2 id={`${id}-h`} className="page__title">
        {t('generate.no_connection_title')}
      </h2>
      <div className="card">
        <p>{t('generate.no_connection_body')}</p>
        <p className="card__muted">{t('generate.no_connection_outline_hint')}</p>
        {deviceNote && (
          <p className="card__muted" data-testid="no-connection-device">
            {t('generate.no_connection_device')}
          </p>
        )}
      </div>
      <div className="stack-actions">
        <button type="button" className="button" onClick={() => navigate('settings', { section: 'connection' })} data-testid="no-connection-connect">
          {t('generate.no_connection_connect')}
        </button>
        <button type="button" className="button button--secondary" onClick={() => navigate('outline', { ref: refText })} data-testid="no-connection-outline">
          {t('generate.no_connection_outline')}
        </button>
        <button type="button" className="button button--secondary" onClick={() => navigate('read', { ref: refText })} data-testid="generate-back">
          {t('generate.back_to_reading')}
        </button>
      </div>
    </section>
  );
}
