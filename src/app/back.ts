// Back key (DESIGN ch. 8, S17). The Android back key/gesture arrives as the window event `app:back`
// (sent by src/app/platform.ts from the native Shell plugin). One press undoes one thing, newest first:
//   1. the latest in-screen state a screen registered (open menu or panel, confirm prompt, selection,
//      wizard or form step, expanded text) — see useBackHandler
//   2. otherwise the previous screen in this session's history
//   3. otherwise home, if this is another screen opened directly
//   4. at home (or the first-run wizard) with nothing open: leave the app
import { useEffect, useRef } from 'react';
import { historyDepth, navigate, parseHash } from './router';

export const BACK_EVENT = 'app:back';

export type BackOutcome = 'state' | 'history' | 'home' | 'exit';

interface Entry {
  run: () => void;
}
const stack: Entry[] = [];

/** Register an undo step; the newest runs first. Returns the remover. */
export function pushBackHandler(run: () => void): () => void {
  const entry: Entry = { run };
  stack.push(entry);
  return () => {
    const i = stack.lastIndexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** While `active`, the back key runs `onBack` (latest closure) instead of leaving the screen. */
export function useBackHandler(active: boolean, onBack: () => void): void {
  const ref = useRef(onBack);
  useEffect(() => {
    ref.current = onBack;
  });
  useEffect(() => (active ? pushBackHandler(() => ref.current()) : undefined), [active]);
}

export function handleBack(): BackOutcome {
  const top = stack[stack.length - 1];
  if (top) {
    top.run();
    return 'state';
  }
  if (historyDepth() > 0) {
    history.back();
    return 'history';
  }
  const name = parseHash(window.location.hash).name;
  // The first-run wizard is the app's first screen: leaving it with back must not skip it.
  if (name !== 'home' && name !== 'wizard') {
    navigate('home', undefined, { replace: true });
    return 'home';
  }
  return 'exit';
}

/** Listen for the back key; `exit` is called when there is nothing left to go back to. */
export function installBackKey(exit: () => void): () => void {
  const onBack = () => {
    if (handleBack() === 'exit') exit();
  };
  window.addEventListener(BACK_EVENT, onBack);
  return () => window.removeEventListener(BACK_EVENT, onBack);
}

/** Test seam only for unit tests: drop every registered handler. */
export function resetBackHandlers(): void {
  stack.length = 0;
}
