// Style profile card on My Sermons (DESIGN 3.9; S10). Shows the status (none / ready / stale),
// and makes the profile only after a confirmation screen that says the sermons go to the chosen
// provider (with the Gemini free-tier warning there). Without a connection or the
// external_transfer consent there is no button and nothing is sent.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createStyleProfile, type StyleProfileOutcome } from '../../core/generate';
import { causeMessageKey, DAILY_LIMIT, getConnection, remainingToday, type Connection } from '../../core/llm';
import { limitedStyle, styleProfileStatus, type StyleProfileStatus } from '../../core/sermon';
import { deleteStyleProfileRecord, hasConsent } from '../../core/store';
import { t, useLanguage } from '../../i18n';
import { useBackHandler } from '../../app/back';

interface Ctx {
  conn: Connection | null;
  consent: boolean;
  status: StyleProfileStatus;
  remaining: number;
}

type Phase = 'idle' | 'confirm' | 'sending';

async function load(): Promise<Ctx> {
  const conn = await getConnection().catch(() => null);
  const [consent, status, remaining] = await Promise.all([
    conn ? hasConsent('external_transfer', conn.provider).catch(() => false) : Promise.resolve(false),
    styleProfileStatus(),
    conn ? remainingToday().catch(() => 0) : Promise.resolve(0),
  ]);
  return { conn, consent, status, remaining };
}

function outcomeMessage(o: StyleProfileOutcome): { text: string; error: boolean } {
  if (o.kind === 'saved') {
    const saved = t('sermons.style.saved');
    return { text: o.removed > 0 ? `${saved} ${t('sermons.style.removed_note', { n: o.removed })}` : saved, error: false };
  }
  if (o.kind === 'cancelled') return { text: t('sermons.style.cancelled'), error: false };
  if (o.kind === 'blocked') return { text: t(`sermons.style.${o.reason}`), error: true };
  if (o.reason === 'validation') return { text: t('sermons.style.failed'), error: true };
  return { text: t(causeMessageKey(o.reason), { n: DAILY_LIMIT }), error: true };
}

/** `version` changes whenever the sermon list changes, so the status is read again. */
export function StyleProfileCard({ version }: { version: number }) {
  const id = useId();
  const lang = useLanguage();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useBackHandler(phase === 'confirm', () => setPhase('idle'));

  const reload = useCallback(() => {
    load().then(setCtx, () => setFailed(true));
  }, []);
  useEffect(reload, [reload, version]);
  useEffect(() => () => controller.current?.abort(), []);

  const send = async () => {
    const c = new AbortController();
    controller.current = c;
    setPhase('sending');
    setMessage(null);
    let outcome: StyleProfileOutcome;
    try {
      outcome = await createStyleProfile({ lang, signal: c.signal });
    } catch {
      outcome = { kind: 'failed', reason: 'unknown', calls: 0 };
    }
    if (controller.current !== c) return;
    setMessage(outcomeMessage(outcome));
    setPhase('idle');
    reload();
  };

  const remove = async () => {
    try {
      await deleteStyleProfileRecord();
      setMessage({ text: t('sermons.style.deleted'), error: false });
      reload();
    } catch {
      setFailed(true);
    }
  };

  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US');

  if (failed)
    return (
      <section className="card style-profile" data-testid="style-profile">
        <p className="field__error" role="alert">
          {t('sermons.load_failed')}
        </p>
      </section>
    );
  if (!ctx) return null;

  const { conn, consent, status } = ctx;
  const count = status.sermonCount;
  const canMake = conn !== null && consent && count > 0;
  const limited = count > 0 && limitedStyle(count);
  const provider = conn ? t(`llm.provider_name.${conn.provider}`) : '';

  return (
    <section className="card style-profile" aria-labelledby={`${id}-h`} data-testid="style-profile">
      <h3 id={`${id}-h`} className="card__title">
        {t('sermons.style.title')}
      </h3>
      <p className="card__muted">{t('sermons.style.intro')}</p>

      <p data-testid="style-profile-state" data-state={status.state}>
        {status.state === 'ready' && t('sermons.style.ready', { date: date(status.record.created_at), n: status.record.sermon_count })}
        {status.state === 'stale' && t('sermons.style.stale')}
        {status.state === 'none' && t('sermons.style.none')}
      </p>
      {status.state === 'ready' && (
        <ul className="style-profile__fields" data-testid="style-profile-fields">
          <li>{t('sermons.style.field.avg_sentence_len', { n: status.profile.avg_sentence_len })}</li>
          <li>{t('sermons.style.field.question_ratio', { n: Math.round(status.profile.question_ratio * 100) })}</li>
          <li>{t('sermons.style.field.illustration_freq', { v: t(`sermons.style.freq.${status.profile.illustration_freq}`) })}</li>
          <li>{t('sermons.style.field.structure', { v: t(`sermons.style.structure.${status.profile.structure}`) })}</li>
          <li>
            {t('sermons.style.field.tone')}
            <ul>
              {status.profile.tone_summary.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </li>
          {status.profile.frequent_phrases.length > 0 && (
            <li>
              {t('sermons.style.field.phrases')}
              <ul>
                {status.profile.frequent_phrases.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
      {limited && (
        <p className="style-profile__limited" data-testid="style-profile-limited">
          {t('sermons.style.limited')}
        </p>
      )}

      {!conn && (
        <p className="card__muted" data-testid="style-profile-no-connection">
          {t('sermons.style.no_connection')}
        </p>
      )}
      {conn && !consent && (
        <p className="card__muted" data-testid="style-profile-no-consent">
          {t('sermons.style.no_consent')}
        </p>
      )}
      {conn && consent && count === 0 && <p className="card__muted">{t('sermons.style.no_sermons')}</p>}

      <p role="status" className={message?.error ? 'field__error' : 'sermons__status'} data-testid="style-profile-status">
        {phase === 'sending' ? t('sermons.style.sending') : (message?.text ?? '')}
      </p>

      {phase === 'confirm' && conn && (
        <div className="style-profile__confirm" role="alertdialog" aria-labelledby={`${id}-c`} data-testid="style-profile-confirm">
          <p id={`${id}-c`} className="card__title">
            {t('sermons.style.confirm_title')}
          </p>
          <p data-testid="style-profile-confirm-body">{t('sermons.style.confirm_body')}</p>
          <p className="card__muted">{t('sermons.style.confirm_detail', { n: count, provider })}</p>
          {conn.provider === 'gemini' && (
            <p className="style-profile__warning" role="note" data-testid="style-profile-gemini-warning">
              {t('sermons.style.gemini_warning')}
            </p>
          )}
          {limited && <p className="style-profile__limited">{t('sermons.style.limited')}</p>}
          <p className="card__muted">{t('generate.remaining', { n: ctx.remaining })}</p>
          <div className="sermons__actions">
            <button type="button" className="button" onClick={() => void send()} data-testid="style-profile-send">
              {t('sermons.style.send')}
            </button>
            <button type="button" className="button button--secondary" onClick={() => setPhase('idle')} data-testid="style-profile-cancel">
              {t('sermons.style.cancel')}
            </button>
          </div>
        </div>
      )}

      {phase === 'sending' && (
        <button type="button" className="button button--secondary" onClick={() => controller.current?.abort()} data-testid="style-profile-stop">
          {t('sermons.style.stop')}
        </button>
      )}

      {phase === 'idle' && (canMake || status.state !== 'none') && (
        <div className="sermons__actions">
          {canMake && (
            <button type="button" className="button" onClick={() => setPhase('confirm')} data-testid="style-profile-make">
              {status.state === 'none' ? t('sermons.style.make') : t('sermons.style.remake')}
            </button>
          )}
          {status.state !== 'none' && (
            <button type="button" className="button button--secondary" onClick={() => void remove()} data-testid="style-profile-delete">
              {t('sermons.style.delete')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
