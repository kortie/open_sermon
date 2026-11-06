import { lazy, Suspense, useEffect } from 'react';
import { bible_db } from '../../config/app.config.json';
import { t, useLanguage } from '../i18n';
import { Menu } from '../ui/Menu';
import { SetupWizard } from '../ui/setup-wizard/SetupWizard';
import { Home } from './home/Home';
import { usePreferences } from './preferences';
import { navigate, useRoute, type RouteName } from './router';
import { Settings } from './settings/Settings';
import { Viewer } from './viewer/Viewer';

// My Sermons loads its parsers (fflate, pdf.js) only when opened (DESIGN 3.9).
const Sermons = lazy(() => import('./sermons/Sermons').then((m) => ({ default: m.Sermons })));
const Retrieve = lazy(() => import('./retrieve/Retrieve').then((m) => ({ default: m.Retrieve })));
const Outline = lazy(() => import('./compose/Outline').then((m) => ({ default: m.Outline })));
const Library = lazy(() => import('./library/Library').then((m) => ({ default: m.Library })));
const Generate = lazy(() => import('./generate/Generate').then((m) => ({ default: m.Generate })));
const Personas = lazy(() => import('./persona/Personas').then((m) => ({ default: m.Personas })));
const ImportWizard = lazy(() => import('../ui/settings/bibles/ImportWizard').then((m) => ({ default: m.ImportWizard })));
const About = lazy(() => import('./about/About').then((m) => ({ default: m.About })));
const BibleGuide = lazy(() => import('../ui/settings/bibles/BibleGuide').then((m) => ({ default: m.BibleGuide })));

/** Menu item that stays highlighted on screens opened from it. */
function menuItemFor(name: RouteName): RouteName {
  if (name === 'search' || name === 'generate' || name === 'outline' || name === 'library' || name === 'retrieve') return 'read';
  if (name === 'persona' || name === 'bible-import' || name === 'bible-guide') return 'settings';
  return name;
}

export function App() {
  const lang = useLanguage();
  const prefs = usePreferences();
  const route = useRoute();
  const firstRun = prefs.wizard_state === 'not_started' && route.name === 'home';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('app.title');
  }, [lang]);

  // First run lands on the wizard (deep links such as #/read still open directly).
  useEffect(() => {
    if (firstRun) navigate('wizard', undefined, { replace: true });
  }, [firstRun]);

  const inWizard = route.name === 'wizard' || firstRun;

  let screen;
  if (inWizard) screen = <SetupWizard />;
  else if (route.name === 'read' || route.name === 'search')
    screen = <Viewer key={route.key} initialRef={route.params.get('ref') ?? undefined} initialQuery={route.params.get('q') ?? undefined} />;
  else if (route.name === 'settings') screen = <Settings />;
  else if (route.name === 'sermons') screen = <Sermons />;
  else if (route.name === 'retrieve') screen = <Retrieve key={route.key} refParam={route.params.get('ref') ?? ''} />;
  else if (route.name === 'outline')
    screen = <Outline key={route.key} refParam={route.params.get('ref') ?? undefined} idParam={route.params.get('id') ?? undefined} pickParam={route.params.get('pick') ?? undefined} />;
  else if (route.name === 'library') screen = <Library key={route.key} refParam={route.params.get('ref') ?? undefined} kindParam={route.params.get('kind') ?? undefined} />;
  else if (route.name === 'persona') screen = <Personas />;
  else if (route.name === 'bible-import') screen = <ImportWizard key={route.key} />;
  else if (route.name === 'bible-guide') screen = <BibleGuide />;
  else if (route.name === 'about') screen = <About />;
  else if (route.name === 'generate') screen = <Generate key={route.key} refParam={route.params.get('ref') ?? ''} kindParam={route.params.get('kind') ?? undefined} />;
  else screen = <Home />;

  return (
    <div className="shell">
      {/* No fixed top bar (DESIGN ch. 8, v0.18): the page title stays for screen readers only. */}
      <h1 className="visually-hidden">{t('app.title')}</h1>
      {!inWizard && <Menu current={menuItemFor(route.name)} />}
      <main className="shell__main" data-testid="shell-main">
        <Suspense fallback={<p className="card__muted">{t('viewer.loading')}</p>}>{screen}</Suspense>
      </main>
      <footer className="shell__footer" data-testid="footer">
        <p>{t('footer.source', { tag: bible_db.release_tag })}</p>
      </footer>
    </div>
  );
}
