import type { Locator, Page } from '@playwright/test';

/**
 * Dispatch a synthetic single-finger touch event at viewport point (x, y).
 * Like a real touch, move/end go to the element where touchstart began.
 * Chromium supports `new Touch`; WebKit needs document.createTouch / createTouchList.
 * Returns false when the app called preventDefault().
 */
export async function touch(page: Page, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number): Promise<boolean> {
  return page.evaluate(
    ({ type, x, y }) => {
      type LegacyDoc = Document & {
        createTouch?: (...a: unknown[]) => Touch;
        createTouchList?: (...t: Touch[]) => TouchList;
      };
      const d = document as LegacyDoc;
      const w = window as unknown as { __touchTarget?: Element | null };
      if (type === 'touchstart') w.__touchTarget = document.elementFromPoint(x, y);
      const target = w.__touchTarget ?? document.body;
      const t = d.createTouch
        ? d.createTouch(window, target, 1, x + scrollX, y + scrollY, x, y)
        : new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x + scrollX, pageY: y + scrollY, screenX: x, screenY: y });
      const list = (arr: Touch[]) => (d.createTouchList ? d.createTouchList(...arr) : arr) as unknown as Touch[];
      const touches = type === 'touchend' ? list([]) : list([t]);
      const ev = new TouchEvent(type, { bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: list([t]) });
      return target.dispatchEvent(ev);
    },
    { type, x, y },
  );
}

/** Center the element in the viewport and return a point on it (right side, away from the check area). */
export async function pointOn(el: Locator): Promise<{ x: number; y: number }> {
  await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
  const box = await el.boundingBox();
  if (!box) throw new Error('element not visible');
  return { x: box.x + box.width - 24, y: box.y + box.height / 2 };
}

/** Press on an element for `ms` of fake time (page.clock must be paused). Leaves the finger down when `release` is false. */
export async function press(page: Page, el: Locator, ms: number, release = true) {
  const p = await pointOn(el);
  await touch(page, 'touchstart', p.x, p.y);
  await page.clock.runFor(ms);
  if (release) await touch(page, 'touchend', p.x, p.y);
  return p;
}

/** A quick tap (no long press). */
export async function tap(page: Page, el: Locator) {
  const p = await pointOn(el);
  await touch(page, 'touchstart', p.x, p.y);
  await page.clock.runFor(50);
  return touch(page, 'touchend', p.x, p.y);
}
