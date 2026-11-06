// Long-press recognition on the verse list (DESIGN 3.1.1, CLAUDE.md 4.3, skill §4.2).
// - touchstart/touchmove are registered with passive: false on the verse list only.
// - Moving more than MOVE_TOLERANCE_PX before the threshold is a scroll: the press is dropped.
// - After the threshold the finger drags the selection; only then is touchmove default-prevented
//   (normal scrolling is never blocked). Auto-scroll runs only within EDGE_PX of the top edge or of
//   the action bar's top edge (the bottom of the visible reading area).
// - contextmenu is prevented on the verse list only. No hover, right-click or Shift handlers (rule 13).
import { useEffect, useRef, type RefObject } from 'react';
import { ui } from '../../../config/app.config.json';
import { isCancelledAttempt } from '../../core/selection';

export const MOVE_TOLERANCE_PX = 10;
export const EDGE_PX = 48;
const AUTO_SCROLL_STEP_PX = 8;

export interface LongPressHandlers {
  onLongPress: (verse: number) => void;
  onTap: (verse: number) => void;
  onDragTo: (verse: number) => void;
  onDragEnd: () => void;
  onCancelledAttempt: () => void;
}

interface Press {
  verse: number;
  x: number;
  y: number;
  started: number;
  timer: ReturnType<typeof setTimeout> | null;
  fired: boolean;
  lastVerse: number;
  lastX: number;
  lastY: number;
}

/** Verse under a point, looking through overlays such as the fixed action bar. */
function verseAtPoint(x: number, y: number, root: HTMLElement): number | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const v = verseFrom(el, root);
    if (v !== null) return v;
  }
  return null;
}

/** Bottom of the visible reading area: the top of the action bar when it is shown. */
function readingBottom(): number {
  const bar = document.querySelector('.action-bar');
  return bar ? Math.min(window.innerHeight, bar.getBoundingClientRect().top) : window.innerHeight;
}

function verseFrom(el: Element | null, root: HTMLElement): number | null {
  const li = el?.closest<HTMLElement>('[data-verse]');
  if (!li || !root.contains(li)) return null;
  const n = Number(li.dataset.verse);
  return Number.isInteger(n) ? n : null;
}

export function useLongPress(listRef: RefObject<HTMLElement | null>, handlers: LongPressHandlers, thresholdMs: number = ui.long_press_ms) {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    let press: Press | null = null;
    let edgeDir = 0;
    let frame = 0;

    const stopAutoScroll = () => {
      edgeDir = 0;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const dragAt = (x: number, y: number) => {
      if (!press) return;
      const v = verseAtPoint(x, y, root);
      if (v !== null && v !== press.lastVerse) {
        press.lastVerse = v;
        h.current.onDragTo(v);
      }
    };
    const autoScroll = () => {
      if (!press || edgeDir === 0) return stopAutoScroll();
      window.scrollBy(0, edgeDir * AUTO_SCROLL_STEP_PX);
      dragAt(press.lastX, press.lastY);
      frame = requestAnimationFrame(autoScroll);
    };
    const end = () => {
      if (press?.timer) clearTimeout(press.timer);
      press = null;
      stopAutoScroll();
    };

    const onStart = (e: TouchEvent) => {
      end();
      if (e.touches.length !== 1) return;
      const target = e.target as Element;
      // Controls inside the list (the check area) keep their own behaviour.
      if (target.closest('button, a, input')) return;
      const verse = verseFrom(target, root);
      const t = e.touches[0];
      if (verse === null || !t) return;
      const p: Press = { verse, x: t.clientX, y: t.clientY, started: performance.now(), timer: null, fired: false, lastVerse: verse, lastX: t.clientX, lastY: t.clientY };
      p.timer = setTimeout(() => {
        p.timer = null;
        p.fired = true;
        h.current.onLongPress(verse);
      }, thresholdMs);
      press = p;
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!press || !t) return;
      if (!press.fired) {
        // Scrolling: give up the press, no counter (not a long-press attempt).
        if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > MOVE_TOLERANCE_PX) end();
        return;
      }
      e.preventDefault();
      press.lastX = t.clientX;
      press.lastY = t.clientY;
      dragAt(t.clientX, t.clientY);
      const dir = t.clientY < EDGE_PX ? -1 : t.clientY > readingBottom() - EDGE_PX ? 1 : 0;
      if (dir !== edgeDir) {
        stopAutoScroll();
        edgeDir = dir;
        if (dir !== 0) frame = requestAnimationFrame(autoScroll);
      }
    };

    const onEnd = (e: TouchEvent) => {
      const p = press;
      if (!p) return;
      if (p.fired) {
        e.preventDefault();
        h.current.onDragEnd();
      } else {
        if (isCancelledAttempt(performance.now() - p.started, false, thresholdMs)) h.current.onCancelledAttempt();
        h.current.onTap(p.verse);
      }
      end();
    };

    const onCancel = () => {
      if (press?.fired) h.current.onDragEnd();
      end();
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    root.addEventListener('touchstart', onStart, { passive: false });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onCancel);
    root.addEventListener('contextmenu', onContextMenu);
    return () => {
      end();
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onCancel);
      root.removeEventListener('contextmenu', onContextMenu);
    };
  }, [listRef, thresholdMs]);
}

/** Taps outside the verse list and controls clear the selection (tap on empty space, DESIGN 3.1.1). */
export function useTapOutside(active: boolean, onTapOutside: () => void) {
  const cb = useRef(onTapOutside);
  useEffect(() => {
    cb.current = onTapOutside;
  });
  useEffect(() => {
    if (!active) return;
    let start: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const s = start;
      start = null;
      if (!s || !t || Math.hypot(t.clientX - s.x, t.clientY - s.y) > MOVE_TOLERANCE_PX) return;
      const target = e.target as Element | null;
      if (target?.closest('[data-verse], button, a, input, label, [data-selection-keep]')) return;
      cb.current();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [active]);
}
