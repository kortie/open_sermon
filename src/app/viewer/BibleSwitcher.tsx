// Reading bible choice inside the reader (DESIGN 3.1, 3.12; S12). Lists the bundled bibles and the
// imported ones ("my imported version"); choosing one becomes the default from then on. Managing
// imported bibles (import, delete, guide) stays in Settings.
import { useEffect, useId, useState } from 'react';
import { i18n, ui } from '../../../config/app.config.json';
import { isImportedBibleId } from '../../core/bible-import';
import { availableBibles, listImportedBibles, type ImportedBibleRecord } from '../../core/store';
import { t, useLanguage } from '../../i18n';
import { ChoiceGroup } from '../../ui/ChoiceGroup';
import { preferences } from '../preferences';
import { navigate } from '../router';

const BUNDLED = availableBibles({ i18n, ui, wizard: { steps: [] } });

function useImportedBibles(): ImportedBibleRecord[] | null {
  const [list, setList] = useState<ImportedBibleRecord[] | null>(null);
  useEffect(() => {
    let live = true;
    listImportedBibles().then(
      (l) => live && setList(l),
      () => live && setList([]),
    );
    return () => {
      live = false;
    };
  }, []);
  return list;
}

/** Short display name of the reading bible (bundled name, or the imported bible's own name). */
export function useBibleLabel(bible: string): string {
  useLanguage();
  const imported = isImportedBibleId(bible);
  const [name, setName] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!imported) return;
    let live = true;
    listImportedBibles().then(
      (l) => live && setName({ id: bible, name: l.find((b) => b.id === bible)?.name ?? '' }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [bible, imported]);
  if (!imported) return t(`bible_short.${bible}`);
  return name?.id === bible && name.name ? name.name : t('viewer.bible_imported');
}

export function BibleSwitcher({ current, onDone }: { current: string; onDone: () => void }) {
  const id = useId();
  const list = useImportedBibles();
  const options = [
    ...BUNDLED.map((b) => ({ value: b, label: t(`bible.${b}`) })),
    ...(list ?? []).map((b) => ({ value: b.id, label: t('bible_import.label', { name: b.name }) })),
  ];
  return (
    <div className="bible-switch" data-testid="reader-bible-panel">
      <p id={`${id}-h`} className="picker__title">
        {t('viewer.bible_choose')}
      </p>
      <ChoiceGroup
        labelledBy={`${id}-h`}
        testId="reader-bible"
        vertical
        value={current}
        options={options}
        onChange={(b) => {
          void preferences.chooseBible(b, 'settings');
          onDone();
        }}
      />
      <button type="button" className="button button--secondary bible-switch__manage" onClick={() => navigate('settings', { section: 'bibles' })} data-testid="reader-bible-manage">
        {t('viewer.bible_manage')}
      </button>
    </div>
  );
}
