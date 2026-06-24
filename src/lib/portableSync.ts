import type { QuestShelfBackup } from './backupStorage';

export type PortableSyncProvider = {
  description: string;
  id: 'json-download' | 'synced-folder';
  label: string;
  status: 'available' | 'planned';
};

export const portableSyncProviders: PortableSyncProvider[] = [
  {
    id: 'json-download',
    label: 'Backup JSON file',
    description: 'Manual export and import using a portable Questory JSON backup.',
    status: 'available',
  },
  {
    id: 'synced-folder',
    label: 'Synced folder',
    description: 'Future storage adapter for user-owned Google Drive, OneDrive, or Dropbox folders.',
    status: 'planned',
  },
];

export function createPortableBackupFilename(backup: Pick<QuestShelfBackup, 'metadata'>) {
  return `questshelf-backup-${backup.metadata.exportedAt.slice(0, 10)}.json`;
}

export function serializePortableBackup(backup: QuestShelfBackup) {
  return JSON.stringify(backup, null, 2);
}

