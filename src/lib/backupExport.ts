import { createQuestShelfBackup, type QuestShelfBackup } from './backupStorage';
import { downloadQuestShelfBackupFile, downloadRawQuestShelfLocalData } from './browserBackupExport';
import { getRuntimeEnvironment } from './capacitorEnvironment';
import { exportQuestShelfBackupOnAndroid } from './capacitorBackupExport';
import { prepareCanonicalBackup } from './canonicalCollections';
import { getDurableKvFailures, whenDurableKvSettled } from './kvDurableQueue';
import { isBackupRelevantStorageKey } from './backupRevision';
import { flushGameWrites } from './gameStorage';
import { flushPlayActivityWrites } from './playActivityStorage';

export type QuestShelfBackupExportResult = {
  fileName: string;
};

async function exportQuestShelfBackupFile(backup: QuestShelfBackup): Promise<QuestShelfBackupExportResult> {
  if (getRuntimeEnvironment().isAndroid) {
    return exportQuestShelfBackupOnAndroid(backup);
  }

  return downloadQuestShelfBackupFile(backup);
}

/**
 * The only portable-backup creation command used by product export surfaces.
 *
 * A mounted canonical owner contributes the latest React snapshots and flushes games/activity/KV.
 * Standalone settings/tests have no owner, so the repository queue and durable KV tier are still
 * awaited before their synchronous snapshots are serialized.
 */
export async function prepareQuestShelfBackup(includeIntegrationSettings: boolean): Promise<QuestShelfBackup> {
  const snapshots = await prepareCanonicalBackup();
  await Promise.all([
    snapshots ? Promise.resolve() : Promise.all([flushGameWrites(), flushPlayActivityWrites()]),
    whenDurableKvSettled(),
  ]);

  const kvFailures = getDurableKvFailures().filter((result) => isBackupRelevantStorageKey(result.key));
  if (kvFailures.length > 0) {
    throw new Error(kvFailures.map((result) => `${result.key}: ${result.error ?? 'durable write failed'}`).join(' · '));
  }

  return createQuestShelfBackup(includeIntegrationSettings, snapshots);
}

type BackupFileExporter = (backup: QuestShelfBackup) => Promise<QuestShelfBackupExportResult>;

/** Prepare once, then hand that exact payload to the selected browser/native exporter. */
export async function exportPreparedQuestShelfBackupFile(
  includeIntegrationSettings: boolean,
  exporter: BackupFileExporter = exportQuestShelfBackupFile,
): Promise<QuestShelfBackupExportResult & { backup: QuestShelfBackup }> {
  const backup = await prepareQuestShelfBackup(includeIntegrationSettings);
  const result = await exporter(backup);
  return { ...result, backup };
}

export { downloadRawQuestShelfLocalData };
