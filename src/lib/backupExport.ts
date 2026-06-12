import type { QuestShelfBackup } from './backupStorage';
import { downloadQuestShelfBackupFile, downloadRawQuestShelfLocalData } from './browserBackupExport';
import { getRuntimeEnvironment } from './capacitorEnvironment';
import { exportQuestShelfBackupOnAndroid } from './capacitorBackupExport';

export async function exportQuestShelfBackupFile(backup: QuestShelfBackup) {
  if (getRuntimeEnvironment().isAndroid) {
    await exportQuestShelfBackupOnAndroid(backup);
    return;
  }

  downloadQuestShelfBackupFile(backup);
}

export { downloadRawQuestShelfLocalData };
