// Deleting an imported bible: its record and every verse in one transaction (DESIGN 3.14).
import { deleteImportedBible } from '../store/importedBible';

export function removeImportedBible(bibleId: string, db?: IDBDatabase): Promise<void> {
  return deleteImportedBible(bibleId, db);
}
