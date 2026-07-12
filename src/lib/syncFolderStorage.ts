import { createQuestShelfBackup, parseQuestShelfBackupText, type QuestShelfBackup } from './backupStorage';

type FilePickerAcceptType = {
  accept: Record<string, string[]>;
  description: string;
};

type FilePickerOptions = {
  excludeAcceptAllOption?: boolean;
  suggestedName?: string;
  types?: FilePickerAcceptType[];
};

type FileSystemPermissionMode = 'read' | 'readwrite';

type FileSystemFileHandleLike = {
  createWritable: () => Promise<{
    close: () => Promise<void>;
    write: (data: Blob | string) => Promise<void>;
  }>;
  getFile: () => Promise<File>;
  name: string;
  queryPermission?: (options: { mode: FileSystemPermissionMode }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: FileSystemPermissionMode }) => Promise<PermissionState>;
};

type FileSystemWindow = Window &
  typeof globalThis & {
    showOpenFilePicker?: (options?: FilePickerOptions) => Promise<FileSystemFileHandleLike[]>;
    showSaveFilePicker?: (options?: FilePickerOptions) => Promise<FileSystemFileHandleLike>;
  };

type SyncFolderSettings = {
  autoBackupEnabled: boolean;
  includeIntegrationSettings: boolean;
  lastBackupAt: string | null;
  selectedFileName: string | null;
};

const dbName = 'questshelf.syncFolder.v1';
const handleStoreName = 'handles';
const handleKey = 'backup-file';
const settingsKey = 'questshelf.syncFolderSettings.v1';

export const defaultSyncFolderSettings: SyncFolderSettings = {
  autoBackupEnabled: false,
  includeIntegrationSettings: false,
  lastBackupAt: null,
  selectedFileName: null,
};

export type { FileSystemFileHandleLike, SyncFolderSettings };

export function isFileSystemAccessSupported() {
  const currentWindow = window as FileSystemWindow;
  return typeof currentWindow.showOpenFilePicker === 'function' && typeof currentWindow.showSaveFilePicker === 'function';
}

export function loadSyncFolderSettings(): SyncFolderSettings {
  const storedValue = window.localStorage.getItem(settingsKey);

  if (!storedValue) {
    return defaultSyncFolderSettings;
  }

  try {
    return normalizeSyncFolderSettings(JSON.parse(storedValue));
  } catch {
    return defaultSyncFolderSettings;
  }
}

export function saveSyncFolderSettings(settings: SyncFolderSettings) {
  window.localStorage.setItem(settingsKey, JSON.stringify(normalizeSyncFolderSettings(settings)));
}

export async function chooseBackupFileHandle() {
  const currentWindow = window as FileSystemWindow;
  const handle = await currentWindow.showSaveFilePicker?.({
    suggestedName: 'questory-backup.json',
    types: [
      {
        description: 'Questory backup JSON',
        accept: {
          'application/json': ['.json'],
        },
      },
    ],
  });

  if (!handle) {
    return null;
  }

  await saveBackupFileHandle(handle);
  return handle;
}

export async function openBackupFileWithPicker() {
  const currentWindow = window as FileSystemWindow;
  const handles = await currentWindow.showOpenFilePicker?.({
    excludeAcceptAllOption: false,
    types: [
      {
        description: 'Questory backup JSON',
        accept: {
          'application/json': ['.json'],
        },
      },
    ],
  });

  const handle = handles?.[0] ?? null;

  if (!handle) {
    return null;
  }

  return readBackupFromHandle(handle);
}

export async function saveBackupToSelectedFile(includeIntegrationSettings: boolean, preparedBackup?: QuestShelfBackup) {
  const handle = await loadBackupFileHandle();

  if (!handle) {
    return {
      ok: false as const,
      error: 'Choose a backup file in your synced folder first.',
      permissionLost: true,
    };
  }

  const permission = await verifyHandlePermission(handle, 'readwrite');

  if (!permission) {
    return {
      ok: false as const,
      error: 'Questory lost permission to write this backup file. Reselect the file.',
      permissionLost: true,
    };
  }

  const backup = preparedBackup ?? createQuestShelfBackup(includeIntegrationSettings);
  await writeBackupToHandle(handle, backup);

  return {
    ok: true as const,
    backup,
    fileName: handle.name,
  };
}

export async function readBackupFromHandle(handle: FileSystemFileHandleLike) {
  const permission = await verifyHandlePermission(handle, 'read');

  if (!permission) {
    return {
      ok: false as const,
      error: 'Questory cannot read this backup file. Reselect the file and try again.',
      permissionLost: true,
    };
  }

  const file = await handle.getFile();
  const result = parseQuestShelfBackupText(await file.text());

  if (!result.ok) {
    return {
      ok: false as const,
      error: result.error,
      permissionLost: false,
    };
  }

  return {
    ok: true as const,
    backup: result.backup,
    fileName: handle.name,
  };
}

export async function clearBackupFileHandle() {
  const db = await openSyncFolderDb();
  await runStoreRequest(db.transaction(handleStoreName, 'readwrite').objectStore(handleStoreName).delete(handleKey));
  db.close();
}

async function saveBackupFileHandle(handle: FileSystemFileHandleLike) {
  const db = await openSyncFolderDb();
  await runStoreRequest(db.transaction(handleStoreName, 'readwrite').objectStore(handleStoreName).put(handle, handleKey));
  db.close();
}

async function loadBackupFileHandle(): Promise<FileSystemFileHandleLike | null> {
  const db = await openSyncFolderDb();
  const handle = await runStoreRequest<FileSystemFileHandleLike | undefined>(
    db.transaction(handleStoreName, 'readonly').objectStore(handleStoreName).get(handleKey),
  );
  db.close();
  return handle ?? null;
}

async function writeBackupToHandle(handle: FileSystemFileHandleLike, backup: QuestShelfBackup) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(backup, null, 2));
  await writable.close();
}

async function verifyHandlePermission(handle: FileSystemFileHandleLike, mode: FileSystemPermissionMode) {
  if (!handle.queryPermission || !handle.requestPermission) {
    return true;
  }

  const currentPermission = await handle.queryPermission({ mode });

  if (currentPermission === 'granted') {
    return true;
  }

  return (await handle.requestPermission({ mode })) === 'granted';
}

function openSyncFolderDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(handleStoreName);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function runStoreRequest<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export function normalizeSyncFolderSettings(value: unknown): SyncFolderSettings {
  const settings = value && typeof value === 'object' ? (value as Partial<SyncFolderSettings>) : {};

  return {
    autoBackupEnabled: Boolean(settings.autoBackupEnabled),
    includeIntegrationSettings: Boolean(settings.includeIntegrationSettings),
    lastBackupAt: typeof settings.lastBackupAt === 'string' ? settings.lastBackupAt : null,
    selectedFileName: typeof settings.selectedFileName === 'string' ? settings.selectedFileName : null,
  };
}
