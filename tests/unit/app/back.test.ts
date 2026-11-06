// @vitest-environment jsdom
// S17: back key (DESIGN 8장). One press undoes one thing: the newest in-screen state, then the
// previous screen, then home, then the app is left.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACK_EVENT, handleBack, installBackKey, pushBackHandler, resetBackHandlers } from '../../../src/app/back';
import { historyDepth, navigate } from '../../../src/app/router';

/** jsdom runs history.back() asynchronously; wait for the hash to change. */
const settled = () => new Promise((r) => setTimeout(r, 20));

beforeEach(async () => {
  resetBackHandlers();
  navigate('home', undefined, { replace: true });
  // Unwind entries left by an earlier test so every test starts at depth 0.
  while (historyDepth() > 0) {
    history.back();
    await settled();
  }
  navigate('home', undefined, { replace: true });
});
afterEach(() => resetBackHandlers());

describe('history depth', () => {
  it('navigate pushes one level, replace keeps the level', () => {
    expect(historyDepth()).toBe(0);
    navigate('read', { ref: 'JHN 3' });
    expect(historyDepth()).toBe(1);
    navigate('settings');
    expect(historyDepth()).toBe(2);
    navigate('about', undefined, { replace: true });
    expect(historyDepth()).toBe(2);
    expect(window.location.hash).toBe('#/about');
  });

  it('a plain #/ link counts as one more level', async () => {
    navigate('read');
    // What a menu <a href="#/settings"> does: a new entry without our state, then hashchange.
    history.pushState(null, '', '#/settings');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await settled();
    expect(historyDepth()).toBe(2);
  });
});

describe('handleBack', () => {
  it('runs the newest in-screen handler first, one per press', () => {
    const calls: string[] = [];
    pushBackHandler(() => calls.push('older'));
    const remove = pushBackHandler(() => calls.push('newer'));
    expect(handleBack()).toBe('state');
    expect(calls).toEqual(['newer']);
    remove();
    expect(handleBack()).toBe('state');
    expect(calls).toEqual(['newer', 'older']);
  });

  it('removing a handler twice is harmless', () => {
    const remove = pushBackHandler(() => undefined);
    remove();
    remove();
    expect(handleBack()).toBe('exit');
  });

  it('goes back one screen when there is history', async () => {
    navigate('read', { ref: 'JHN 3' });
    navigate('settings');
    expect(handleBack()).toBe('history');
    await settled();
    expect(window.location.hash).toBe('#/read?ref=JHN+3');
    expect(handleBack()).toBe('history');
    await settled();
    expect(window.location.hash).toBe('#/');
  });

  it('a screen opened directly goes home, and home leaves the app', () => {
    navigate('about', undefined, { replace: true });
    expect(handleBack()).toBe('home');
    expect(window.location.hash).toBe('#/');
    expect(handleBack()).toBe('exit');
  });

  it('the first-run wizard is a first screen: back leaves the app instead of skipping it', () => {
    navigate('wizard', undefined, { replace: true });
    expect(handleBack()).toBe('exit');
    expect(window.location.hash).toBe('#/wizard');
  });

  it('the back event calls exit only when nothing is left', () => {
    const exit = vi.fn();
    const uninstall = installBackKey(exit);
    const remove = pushBackHandler(() => undefined);
    window.dispatchEvent(new Event(BACK_EVENT));
    expect(exit).not.toHaveBeenCalled();
    remove();
    window.dispatchEvent(new Event(BACK_EVENT));
    expect(exit).toHaveBeenCalledTimes(1);
    uninstall();
    window.dispatchEvent(new Event(BACK_EVENT));
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
