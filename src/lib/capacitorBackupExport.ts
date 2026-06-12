import type { QuestShelfBackup } from './backupStorage';
import { downloadQuestShelfBackupFile } from './browserBackupExport';

export async function exportQuestShelfBackupOnAndroid(backup: QuestShelfBackup) {
  // Capacitor Android does not bundle a filesystem/share exporter yet, so keep the
  // existing WebView download behavior behind a native-specific adapter.
  downloadQuestShelfBackupFile(backup);
}
