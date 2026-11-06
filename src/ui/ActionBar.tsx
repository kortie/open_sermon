// Bottom action bar for selected verses (DESIGN 3.1.1). Presentational only.
// S05: the four actions open the independent screens (outline, Search My Sermons, library).
// S12: the Reflection Draft is the primary button, above the others.
import { useEffect, useRef } from 'react';
import { t } from '../i18n';

interface Props {
  reference: string;
  count: number;
  status: 'copied' | 'copy_failed' | null;
  onCopy: () => void;
  onClearLast: () => void;
  onClearAll: () => void;
  onAction: (action: SelectionAction) => void;
}

export const SELECTION_ACTIONS = ['outline', 'my_sermons', 'illustrations', 'remark'] as const;
export type SelectionAction = (typeof SELECTION_ACTIONS)[number] | 'draft';

export function ActionBar({ reference, count, status, onCopy, onClearLast, onClearAll, onAction }: Props) {
  const bar = useRef<HTMLElement>(null);
  const spacer = useRef<HTMLDivElement>(null);

  // Keep the last verses reachable: a spacer as tall as the fixed bar.
  useEffect(() => {
    const el = bar.current;
    const sp = spacer.current;
    if (!el || !sp) return;
    const sync = () => {
      sp.style.height = `${el.offsetHeight}px`;
    };
    sync();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  return (
    <>
      <div ref={spacer} aria-hidden="true" />
      <section ref={bar} className="action-bar" aria-label={t('selection.bar_label')} data-testid="action-bar" data-selection-keep>
        <p className="action-bar__ref" aria-live="polite" data-testid="action-ref">
          <span>{reference}</span> <span className="action-bar__count">{t('selection.count', { n: count })}</span>
        </p>
        <div className="action-bar__row">
          <button type="button" className="button" onClick={onCopy} data-testid="action-copy">
            {t('selection.copy')}
          </button>
          <button type="button" className="button button--secondary" onClick={onClearLast} data-testid="action-clear-last">
            {t('selection.clear_last')}
          </button>
          <button type="button" className="button button--secondary" onClick={onClearAll} data-testid="action-clear-all">
            {t('selection.clear_all')}
          </button>
        </div>
        <button type="button" className="button action-bar__primary" onClick={() => onAction('draft')} data-testid="action-draft">
          {t('selection.action.draft')}
        </button>
        <div className="action-bar__grid">
          {SELECTION_ACTIONS.map((k) => (
            <button key={k} type="button" className="button button--secondary" onClick={() => onAction(k)} data-testid={`action-${k}`}>
              {t(`selection.action.${k}`)}
            </button>
          ))}
        </div>
        {status && (
          <p className={status === 'copied' ? 'action-bar__status' : 'action-bar__status action-bar__status--error'} role="status" data-testid="action-status">
            {t(`selection.${status}`)}
          </p>
        )}
      </section>
    </>
  );
}
