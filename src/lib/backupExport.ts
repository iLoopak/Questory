import type { QuestShelfBackup } from './backupStorage';
import { downloadQuestShelfBackupFile, downloadRawQuestShelfLocalData } from './browserBackupExport';
import { getRuntimeEnvironment } from './capacitorEnvironment';
import { exportQuestShelfBackupOnAndroid } from './capacitorBackupExport';

export type QuestShelfBackupExportResult = {
  fileName: string;
};

export async function exportQuestShelfBackupFile(backup: QuestShelfBackup): Promise<QuestShelfBackupExportResult> {
  if (getRuntimeEnvironment().isAndroid) {
    return exportQuestShelfBackupOnAndroid(backup);
  }

  return downloadQuestShelfBackupFile(backup);
}

export { downloadRawQuestShelfLocalData };
