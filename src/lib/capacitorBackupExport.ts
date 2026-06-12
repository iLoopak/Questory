import { registerPlugin } from '@capacitor/core';
import type { QuestShelfBackup } from './backupStorage';
import { createPortableBackupFilename, serializePortableBackup } from './portableSync';

type NativeBackupExportPlugin = {
  exportBackup(options: { contents: string; filename: string }): Promise<{ fileName: string; uri?: string }>;
};

const NativeBackupExport = registerPlugin<NativeBackupExportPlugin>('NativeBackupExport');

export type BackupExportResult = {
  fileName: string;
};

export async function exportQuestShelfBackupOnAndroid(backup: QuestShelfBackup): Promise<BackupExportResult> {
  const fileName = createPortableBackupFilename(backup);
  const result = await NativeBackupExport.exportBackup({
    contents: serializePortableBackup(backup),
    filename: fileName,
  });

  return { fileName: result.fileName || fileName };
}
