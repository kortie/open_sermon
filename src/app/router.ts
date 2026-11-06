// Minimal hash router: works on static hosting and keeps the Android back button useful.
// Routes: #/ (home), #/read?ref=…, #/search?q=…, #/sermons, #/settings[?section=backup], #/wizard,
// #/retrieve?ref=…, #/outline[?ref=…|?id=…], #/library[?ref=…&kind=…], #/persona,
// #/generate?ref=…&kind=example|one_liner, #/bible-import, #/bible-guide (S11), #/about (S16)
import { useSyncExternalStore } from 'react';

export type RouteName = 'home' | 'read' | 'search' | 'sermons' | 'settings' | 'wizard' | 'retrieve' | 'outline' | 'library' | 'persona' | 'generate' | 'bible-import' | 'bible-guide' | 'about';

export interface Route {
  name: RouteName;
  params: URLSearchParams;
  /** Raw hash, used as a React key so a new navigation resets screen state. */
  key: string;
}

const NAMES: readonly RouteName[] = ['home', 'read', 'search', 'sermons', 'settings', 'wizard', 'retrieve', 'outline', 'library', 'persona', 'generate', 'bible-import', 'bible-guide', 'about'];

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?', 2);
  const name = (NAMES as readonly string[]).includes(path) ? (path as RouteName) : 'home';
  return { name, params: new URLSearchParams(query), key: hash || '#/' };
}

export function routeHref(name: RouteName, params?: Record<string, string>): string {
  const q = params ? new URLSearchParams(params).toString() : '';
  return `#/${name === 'home' ? '' : name}${q ? `?${q}` : ''}`;
}

export function navigate(name: RouteName, params?: Record<string, string>, { replace = false } = {}): void {
  const href = routeHref(name, params);
  if (replace) {
    history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = href;
  }
}

let cached: Route | null = null;
function snapshot(): Route {
  const hash = window.location.hash;
  if (!cached || cached.key !== (hash || '#/')) cached = parseHash(hash);
  return cached;
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener('hashchange', fn);
      return () => window.removeEventListener('hashchange', fn);
    },
    snapshot,
    snapshot,
  );
}
