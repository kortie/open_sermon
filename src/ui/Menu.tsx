// Floating menu button + side menu (DESIGN ch. 8 item 0, v0.18). Replaces the fixed top tabs so the reading
// text starts at the top of the screen. The button hides while the selection action bar is open
// (CSS), and the menu closes on a backdrop tap, Escape, or choosing an item.
import { useEffect, useId, useRef, useState } from 'react';
import { routeHref, type RouteName } from '../app/router';
import { t } from '../i18n';

export const MENU_ITEMS: { name: RouteName; key: string }[] = [
  { name: 'home', key: 'nav.home' },
  { name: 'read', key: 'nav.read' },
  { name: 'sermons', key: 'nav.sermons' },
  { name: 'settings', key: 'nav.settings' },
];

export function Menu({ current }: { current: RouteName }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // A route change (item chosen, back button) closes the menu.
  useEffect(() => {
    const onHash = () => setOpen(false);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="menu-fab"
        aria-label={t('menu.open')}
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => setOpen(true)}
        data-testid="menu-open"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </svg>
      </button>
      {open && (
        <div className="menu" data-testid="menu">
          <button type="button" className="menu__backdrop" aria-label={t('menu.close')} onClick={close} data-testid="menu-backdrop" />
          <nav id={`${id}-menu`} className="menu__panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
            <div className="menu__head">
              <p id={`${id}-title`} className="menu__title">
                {t('app.title')}
              </p>
              <button type="button" className="button button--secondary menu__close" onClick={close} data-testid="menu-close">
                {t('menu.close')}
              </button>
            </div>
            <ul className="menu__list">
              {MENU_ITEMS.map((n, i) => (
                <li key={n.name}>
                  <a
                    ref={i === 0 ? first : undefined}
                    className="menu__item"
                    href={routeHref(n.name)}
                    aria-current={current === n.name ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    data-testid={`nav-${n.name}`}
                  >
                    {t(n.key)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
