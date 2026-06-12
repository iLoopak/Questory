import { createPortableBackupFilename, serializePortableBackup } from './portableSync';
import type { QuestShelfBackup } from './backupStorage';

export type BrowserBackupExportResult = {
  fileName: string;
};

export function downloadQuestShelfBackupFile(backup: QuestShelfBackup): BrowserBackupExportResult {
  const fileName = createPortableBackupFilename(backup);
  downloadJsonFile(serializePortableBackup(backup), fileName);

  return { fileName };
}

export function downloadRawQuestShelfLocalData(rawData: unknown) {
  downloadJsonFile(
    JSON.stringify({ exportedAt: new Date().toISOString(), rawData }, null, 2),
    `questshelf-raw-local-data-${new Date().toISOString().slice(0, 10)}.json`,
  );
}

function downloadJsonFile(contents: string, filename: string) {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
