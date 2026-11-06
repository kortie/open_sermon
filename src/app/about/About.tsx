// About ("made by") screen (DESIGN 3.17, S16): app name and version, the studio, contact mail, the app
// license and third-party notices (bundled text files, same origin), the bundled Bible text sources,
// and "buy the developer a coffee" through Google Play Billing (Android app only).
import { useEffect, useState } from 'react';
import { about, support } from '../../../config/app.config.json';
import { t } from '../../i18n';
import { APP_VERSION, coffeeFailure, nativeCoffee, type CoffeeBridge, type CoffeeFailure } from '../platform';
import { useBackHandler } from '../back';

const isPlaceholder = (v: string) => /^<.*>$/.test(v);
const LICENSE_FILES = { app: 'licenses/app.txt', third_party: 'licenses/third-party.txt' } as const;
type LicenseDoc = keyof typeof LICENSE_FILES;

function LicenseText({ doc }: { doc: LicenseDoc }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(LICENSE_FILES[doc])
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('license'))))
      .then(
        (s) => live && setText(s),
        () => live && setFailed(true),
      );
    return () => {
      live = false;
    };
  }, [doc]);
  if (failed)
    return (
      <p className="field__error" role="alert">
        {t('common.load_failed')}
      </p>
    );
  if (text === null) return <p className="card__muted">{t('common.loading')}</p>;
  return (
    <pre className="about__license" data-testid={`about-license-${doc}`}>
      {text}
    </pre>
  );
}

type CoffeeState = { s: 'checking' } | { s: 'off' } | { s: 'ready'; price?: string } | { s: 'buying'; price?: string } | { s: 'thanks' } | { s: 'pending' } | { s: 'failed'; why: CoffeeFailure; price?: string };

function Coffee({ bridge }: { bridge: CoffeeBridge }) {
  const [state, setState] = useState<CoffeeState>({ s: 'checking' });
  useEffect(() => {
    let live = true;
    bridge.product().then(
      (p) => live && setState(p.available ? { s: 'ready', price: p.price } : { s: 'off' }),
      () => live && setState({ s: 'off' }),
    );
    return () => {
      live = false;
    };
  }, [bridge]);

  if (state.s === 'off' || state.s === 'checking') return null;
  const price = 'price' in state ? state.price : undefined;
  const buy = async () => {
    setState({ s: 'buying', price });
    try {
      const r = await bridge.buy();
      setState(r === 'thanks' ? { s: 'thanks' } : r === 'pending' ? { s: 'pending' } : { s: 'ready', price });
    } catch (err) {
      setState({ s: 'failed', why: coffeeFailure(err), price });
    }
  };
  return (
    <section className="card" aria-labelledby="about-coffee" data-testid="about-coffee">
      <h3 id="about-coffee" className="card__title">
        {t('about.coffee.title')}
      </h3>
      <p>{t('about.coffee.body')}</p>
      <p className="card__muted">{t('about.coffee.note')}</p>
      {state.s === 'thanks' && (
        <p role="status" data-testid="about-coffee-thanks">
          {t('about.coffee.thanks')}
        </p>
      )}
      {state.s === 'pending' && (
        <p role="status" data-testid="about-coffee-pending">
          {t('about.coffee.pending')}
        </p>
      )}
      {state.s === 'failed' && (
        <p className="field__error" role="alert" data-testid="about-coffee-failed">
          {t(`about.coffee.error.${state.why}`)}
        </p>
      )}
      {state.s !== 'thanks' && state.s !== 'pending' && (
        <button type="button" className="button" disabled={state.s === 'buying'} onClick={() => void buy()} data-testid="about-coffee-buy">
          {price ? t('about.coffee.buy_price', { price }) : t('about.coffee.buy')}
        </button>
      )}
    </section>
  );
}

export function About() {
  const [open, setOpen] = useState<LicenseDoc | null>(null);
  useBackHandler(open !== null, () => setOpen(null));
  const [coffee] = useState(() => nativeCoffee(support.coffee));
  const email = isPlaceholder(about.contact_email) ? null : about.contact_email;

  return (
    <div className="about" data-testid="about">
      <h2 className="page__title">{t('about.title')}</h2>

      <section className="card" aria-labelledby="about-app">
        <h3 id="about-app" className="card__title">
          {t('app.title')}
        </h3>
        {APP_VERSION && <p className="card__muted" data-testid="about-version">{t('about.version', { version: APP_VERSION })}</p>}
        <p data-testid="about-studio">{t('about.made_by', { studio: about.studio })}</p>
        <p className="card__muted">{t('about.copyright', { year: about.copyright_year, studio: about.studio })}</p>
      </section>

      <section className="card" aria-labelledby="about-contact">
        <h3 id="about-contact" className="card__title">
          {t('about.contact_title')}
        </h3>
        {email ? (
          <>
            <p data-testid="about-email">{email}</p>
            <a className="button button--secondary" href={`mailto:${email}`} data-testid="about-email-link">
              {t('about.contact_send')}
            </a>
          </>
        ) : (
          <p className="card__muted" data-testid="about-email-none">
            {t('about.contact_none')}
          </p>
        )}
      </section>

      {coffee && <Coffee bridge={coffee} />}

      <section className="card" aria-labelledby="about-license">
        <h3 id="about-license" className="card__title">
          {t('about.license_title')}
        </h3>
        <p data-testid="about-license">{t('about.license_body', { license: about.license })}</p>
        <p className="card__muted">{t('about.bible_text')}</p>
        <div className="stack-actions">
          {(Object.keys(LICENSE_FILES) as LicenseDoc[]).map((doc) => (
            <button
              key={doc}
              type="button"
              className="button button--secondary"
              aria-expanded={open === doc}
              onClick={() => setOpen(open === doc ? null : doc)}
              data-testid={`about-show-${doc}`}
            >
              {t(open === doc ? `about.hide_${doc}` : `about.show_${doc}`)}
            </button>
          ))}
        </div>
        {open && <LicenseText key={open} doc={open} />}
      </section>
    </div>
  );
}
