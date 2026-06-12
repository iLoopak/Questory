import { createPortableBackupFilename, serializePortableBackup } from './portableSync';
import type { QuestShelfBackup } from './backupStorage';

export function downloadQuestShelfBackupFile(backup: QuestShelfBackup) {
  downloadJsonFile(serializePortableBackup(backup), createPortableBackupFilename(backup));
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
