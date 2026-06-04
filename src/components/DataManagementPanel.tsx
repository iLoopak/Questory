import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createQuestShelfBackup,
  getQuestShelfBackupSummary,
  mergeQuestShelfBackup,
  parseQuestShelfBackupText,
  resetQuestShelfLocalData,
  restoreQuestShelfBackup,
  type QuestShelfBackup,
  type QuestShelfBackupSummary,
} from '../lib/backupStorage';
import {
  clearLocalStorageIssues,
  exportRawQuestShelfLocalData,
  getLocalStorageIssues,
  type LocalStorageIssue,
} from '../lib/localPersistence';
import {
  createPortableBackupFilename,
  portableSyncProviders,
  serializePortableBackup,
} from '../lib/portableSync';
import {
  chooseBackupFileHandle,
  clearBackupFileHandle,
  defaultSyncFolderSettings,
  isFileSystemAccessSupported,
  loadSyncFolderSettings,
  openBackupFileWithPicker,
  saveBackupToSelectedFile,
  saveSyncFolderSettings,
  type SyncFolderSettings,
} from '../lib/syncFolderStorage';
import { useI18n } from '../i18n';

type DataManagementPanelProps = {
  autoBackupSignal?: string;
  onBackupExported?: () => void;
};

type ImportMode = 'merge' | 'replace';

export function DataManagementPanel({ autoBackupSignal, onBackupExported }: DataManagementPanelProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [includeIntegrationSettings, setIncludeIntegrationSettings] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [message, setMessage] = useState('Export a local backup before testing destructive actions.');
  const [messageTone, setMessageTone] = useState<'error' | 'info' | 'success'>('info');
  const [storageIssues, setStorageIssues] = useState<LocalStorageIssue[]>(() =>
    typeof window === 'undefined' ? [] : getLocalStorageIssues(),
  );
  const [selectedBackup, setSelectedBackup] = useState<QuestShelfBackup | null>(null);
  const [syncSettings, setSyncSettings] = useState<SyncFolderSettings>(() =>
    typeof window === 'undefined' ? defaultSyncFolderSettings : loadSyncFolderSettings(),
  );
  const autoBackupTimeoutRef = useRef<number | null>(null);
  const autoBackupSignalRef = useRef(autoBackupSignal);
  const supportsFileSystemAccess = useMemo(
    () => typeof window !== 'undefined' && isFileSystemAccessSupported(),
    [],
  );
  const selectedBackupSummary = selectedBackup ? getQuestShelfBackupSummary(selectedBackup) : null;

  useEffect(() => {
    saveSyncFolderSettings(syncSettings);
  }, [syncSettings]);

  useEffect(() => {
    if (!syncSettings.autoBackupEnabled || !supportsFileSystemAccess || !autoBackupSignal) {
      autoBackupSignalRef.current = autoBackupSignal;
      return;
    }

    if (autoBackupSignalRef.current === autoBackupSignal) {
      return;
    }

    autoBackupSignalRef.current = autoBackupSignal;

    if (autoBackupTimeoutRef.current) {
      window.clearTimeout(autoBackupTimeoutRef.current);
    }

    autoBackupTimeoutRef.current = window.setTimeout(() => {
      void saveBackupNow(true);
    }, 1200);

    return () => {
      if (autoBackupTimeoutRef.current) {
        window.clearTimeout(autoBackupTimeoutRef.current);
      }
    };
  }, [autoBackupSignal, supportsFileSystemAccess, syncSettings.autoBackupEnabled, syncSettings.includeIntegrationSettings]);

  function showMessage(nextMessage: string, tone: 'error' | 'info' | 'success' = 'info') {
    setMessage(nextMessage);
    setMessageTone(tone);
  }

  function downloadRawLocalData() {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), rawData: exportRawQuestShelfLocalData() }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `questshelf-raw-local-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showMessage('Raw local data exported for recovery.', 'success');
  }

  function clearRecoveryWarnings() {
    clearLocalStorageIssues();
    setStorageIssues([]);
    showMessage('Storage recovery warnings cleared.');
  }

  function downloadBackup() {
    const backup = createQuestShelfBackup(includeIntegrationSettings);
    const blob = new Blob([serializePortableBackup(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = createPortableBackupFilename(backup);
    link.click();
    URL.revokeObjectURL(url);

    showMessage(
      includeIntegrationSettings
        ? 'Backup exported with integration settings included.'
        : 'Backup exported without API keys or integration settings.',
      'success',
    );
    onBackupExported?.();
  }

  async function chooseSyncFile() {
    if (!supportsFileSystemAccess) {
      showMessage('This device cannot choose a persistent backup file yet. Use manual export/import with a synced folder.', 'error');
      return;
    }

    try {
      const handle = await chooseBackupFileHandle();

      if (!handle) {
        return;
      }

      setSyncSettings((currentSettings) => ({
        ...currentSettings,
        selectedFileName: handle.name,
      }));
      showMessage(`Backup file selected: ${handle.name}.`, 'success');
    } catch {
      showMessage('Backup file selection was cancelled or unavailable.');
    }
  }

  async function saveBackupNow(isAutomatic = false) {
    if (!supportsFileSystemAccess) {
      if (!isAutomatic) {
        downloadBackup();
      }
      return;
    }

    const result = await saveBackupToSelectedFile(syncSettings.includeIntegrationSettings);

    if (!result.ok) {
      if (result.permissionLost) {
        setSyncSettings((currentSettings) => ({
          ...currentSettings,
          autoBackupEnabled: false,
          selectedFileName: null,
        }));
      }

      showMessage(result.error, 'error');
      return;
    }

    setSyncSettings((currentSettings) => ({
      ...currentSettings,
      lastBackupAt: result.backup.metadata.exportedAt,
      selectedFileName: result.fileName,
    }));
    showMessage(
      `${isAutomatic ? 'Auto-backup saved' : 'Backup saved'} to ${result.fileName} at ${formatDateTime(result.backup.metadata.exportedAt)}.`,
      'success',
    );
    onBackupExported?.();
  }

  async function loadBackupWithPicker() {
    if (!supportsFileSystemAccess) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const result = await openBackupFileWithPicker();

      if (!result) {
        return;
      }

      if (!result.ok) {
        showMessage(result.error, 'error');
        return;
      }

      setSelectedBackup(result.backup);
      showBackupReadyMessage(getQuestShelfBackupSummary(result.backup));
    } catch {
      showMessage('Backup file loading was cancelled or unavailable.');
    }
  }

  function enableAutoBackup() {
    if (!supportsFileSystemAccess || !syncSettings.selectedFileName) {
      showMessage('Choose a synced-folder backup file before enabling auto-backup.', 'error');
      return;
    }

    setSyncSettings((currentSettings) => ({
      ...currentSettings,
      autoBackupEnabled: true,
    }));
    showMessage('Auto-backup enabled. QuestShelf will debounce saves after local data changes.', 'success');
  }

  function disableAutoBackup() {
    setSyncSettings((currentSettings) => ({
      ...currentSettings,
      autoBackupEnabled: false,
    }));
    showMessage('Auto-backup disabled.');
  }

  async function readBackupFile(file: File) {
    const result = parseQuestShelfBackupText(await file.text());

    if (!result.ok) {
      setSelectedBackup(null);
      showMessage(result.error, 'error');
      return;
    }

    setSelectedBackup(result.backup);
    showBackupReadyMessage(getQuestShelfBackupSummary(result.backup));
  }

  function showBackupReadyMessage(summary: QuestShelfBackupSummary) {
    showMessage(
      `Backup ready: exported ${formatDateTime(summary.exportedAt)}, schema ${summary.schemaVersion}, ${summary.gameCount} library games, ${summary.wishlistCount} wishlist items.`,
      'success',
    );
  }

  function restoreBackup() {
    if (!selectedBackup) {
      showMessage('Choose a valid QuestShelf backup JSON file first.', 'error');
      return;
    }

    const summary = getQuestShelfBackupSummary(selectedBackup);
    const confirmation = window.prompt(
      [
        `${importMode === 'merge' ? 'Merge' : 'Replace'} local QuestShelf data with this backup?`,
        `Exported: ${formatDateTime(summary.exportedAt)}`,
        `Schema: ${summary.schemaVersion}`,
        `Library games: ${summary.gameCount}`,
        `Wishlist items: ${summary.wishlistCount}`,
        `Type ${importMode === 'merge' ? 'MERGE' : 'REPLACE'} to continue.`,
      ].join('\n'),
    );

    if (confirmation !== (importMode === 'merge' ? 'MERGE' : 'REPLACE')) {
      showMessage('Import cancelled. Local data was not changed.');
      return;
    }

    if (importMode === 'merge') {
      mergeQuestShelfBackup(selectedBackup);
    } else {
      restoreQuestShelfBackup(selectedBackup);
    }

    showMessage('Backup imported. QuestShelf will reload so the updated local library is shown.', 'success');
    window.setTimeout(() => window.location.reload(), 600);
  }

  async function resetLocalData() {
    const confirmation = window.prompt('Type RESET to remove all local QuestShelf data from this device.');

    if (confirmation !== 'RESET') {
      showMessage('Reset cancelled. Local data was not changed.');
      return;
    }

    await resetQuestShelfLocalData();
    if (supportsFileSystemAccess) {
      await clearBackupFileHandle();
    }
    setSyncSettings(defaultSyncFolderSettings);
    setSelectedBackup(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showMessage('Local QuestShelf data was reset on this device. QuestShelf will reload.', 'success');
    window.setTimeout(() => window.location.reload(), 600);
  }

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{t('data.title')}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            {t('data.subtitle')}
          </p>
        </div>
        <button
          className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
          onClick={downloadBackup}
          type="button"
        >
          {t('data.exportBackup')}
        </button>
      </div>

      <StorageRecoveryPanel
        issues={storageIssues}
        onClearWarnings={clearRecoveryWarnings}
        onExportRawData={downloadRawLocalData}
      />

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
          <input
            className="mt-1 h-4 w-4 accent-mint"
            checked={includeIntegrationSettings}
            onChange={(event) => setIncludeIntegrationSettings(event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="block font-medium text-white">{t('data.includeIntegrations')}</span>
            <span className="mt-1 block text-slate-500">
              {t('data.includeIntegrationsHelp')}
            </span>
          </span>
        </label>

        <div className="rounded-md border border-skyglass/15 bg-ink-950/80 p-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {t('data.backupJson')}
            </span>
            <input
              ref={fileInputRef}
              accept="application/json,.json"
              className="mt-2 block w-full text-sm text-slate-300 file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-mint file:px-3 file:text-sm file:font-semibold file:text-ink-950"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void readBackupFile(file);
                }
              }}
              type="file"
            />
          </label>

          <button
            className="mt-3 h-10 w-full rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            disabled={!selectedBackup}
            onClick={restoreBackup}
            type="button"
          >
            {importMode === 'merge' ? t('data.mergeBackup') : t('data.replaceBackup')}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm leading-6 text-slate-400">
        <div className="font-medium text-white">{t('data.portableSync')}</div>
        <div className="mt-1">
          QuestShelf currently uses {portableSyncProviders[0].label.toLowerCase()} export/import.{' '}
          {portableSyncProviders[1].label} support is planned for user-owned cloud folders without accounts.
        </div>
      </div>

      {selectedBackupSummary ? (
        <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
          <div className="grid gap-2 sm:grid-cols-4">
            <BackupSummaryStat label="Exported" value={formatDateTime(selectedBackupSummary.exportedAt)} />
            <BackupSummaryStat label="Schema" value={selectedBackupSummary.schemaVersion.toString()} />
            <BackupSummaryStat label="Library" value={selectedBackupSummary.gameCount.toString()} />
            <BackupSummaryStat label="Wishlist" value={selectedBackupSummary.wishlistCount.toString()} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-md border border-skyglass/15 px-3 py-2">
              <input
                checked={importMode === 'merge'}
                className="accent-mint"
                onChange={() => setImportMode('merge')}
                type="radio"
              />
              <span>{t('data.mergeLocal')}</span>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-skyglass/15 px-3 py-2">
              <input
                checked={importMode === 'replace'}
                className="accent-mint"
                onChange={() => setImportMode('replace')}
                type="radio"
              />
              <span>{t('data.replaceLocal')}</span>
            </label>
          </div>
        </div>
      ) : null}

      <section className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{t('data.syncFolder')}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
              For simple multi-device sync, choose a backup file inside your Google Drive / OneDrive / Dropbox / Syncthing folder.
            </p>
          </div>
          <span className="rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2 text-sm text-slate-300">
            {syncSettings.autoBackupEnabled ? 'Auto-backup on' : 'Auto-backup off'}
          </span>
        </div>

        {supportsFileSystemAccess ? (
          <>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="rounded-md border border-skyglass/15 bg-ink-900 p-3 text-sm leading-6 text-slate-300">
                <div>Selected file: {syncSettings.selectedFileName ?? 'None selected'}</div>
                <div>Last backup: {syncSettings.lastBackupAt ? formatDateTime(syncSettings.lastBackupAt) : 'Never'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="h-10 rounded-md border border-skyglass/15 px-3 text-sm text-slate-200 hover:bg-mint/10 hover:text-white" onClick={chooseSyncFile} type="button">
                  Choose backup file
                </button>
                <button className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 hover:bg-mint/90" onClick={() => void saveBackupNow()} type="button">
                  Save backup now
                </button>
                <button className="h-10 rounded-md border border-skyglass/15 px-3 text-sm text-slate-200 hover:bg-mint/10 hover:text-white" onClick={() => void loadBackupWithPicker()} type="button">
                  Load backup from file
                </button>
                {syncSettings.autoBackupEnabled ? (
                  <button className="h-10 rounded-md border border-red-400/40 bg-red-500/10 px-3 text-sm text-red-200 hover:bg-red-500/20" onClick={disableAutoBackup} type="button">
                    Disable auto-backup
                  </button>
                ) : (
                  <button className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint hover:bg-mint/20" onClick={enableAutoBackup} type="button">
                    Enable auto-backup
                  </button>
                )}
              </div>
            </div>

            <label className="mt-3 flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-900 p-3 text-sm text-slate-300">
              <input
                checked={syncSettings.includeIntegrationSettings}
                className="mt-1 h-4 w-4 accent-mint"
                onChange={(event) =>
                  setSyncSettings((currentSettings) => ({
                    ...currentSettings,
                    includeIntegrationSettings: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>
                <span className="block font-medium text-white">{t('data.includeAutoBackup')}</span>
                <span className="mt-1 block text-slate-500">{t('data.includeAutoBackupHelp')}</span>
              </span>
            </label>
          </>
        ) : (
          <div className="mt-4 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
            This device cannot keep a persistent backup file handle yet. Use {t('data.exportBackup')} and {t('data.backupJson')} above, then save/load that file from your synced folder manually. Android APK builds can add a native file picker later for direct auto-backup writes.
          </div>
        )}
      </section>

      <div
        className={`mt-4 rounded-md border px-3 py-2 text-sm ${
          messageTone === 'error'
            ? 'border-red-400/40 bg-red-500/10 text-red-200'
            : messageTone === 'success'
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border-skyglass/15 bg-ink-950/80 text-slate-300'
        }`}
      >
        {message}
      </div>

      <div className="mt-4 border-t border-white/10 pt-4">
        <button
          className="h-10 rounded-md border border-red-400/40 bg-red-500/10 px-3 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
          onClick={() => void resetLocalData()}
          type="button"
        >
          {t('data.resetLocal')}
        </button>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Reset removes only known QuestShelf local data from this device. It does not touch data from other apps.
        </p>
      </div>
    </section>
  );
}

function BackupSummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm text-white">{value}</div>
    </div>
  );
}

function StorageRecoveryPanel({
  issues,
  onClearWarnings,
  onExportRawData,
}: {
  issues: LocalStorageIssue[];
  onClearWarnings: () => void;
  onExportRawData: () => void;
}) {
  const { t } = useI18n();

  if (issues.length === 0) {
    return null;
  }

  return (
    <section className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-amber-100">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{t('data.storageRecovery')}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6">
            QuestShelf found local data it could not read safely. The app used fallback defaults and did not delete the
            original raw values.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-10 rounded-md border border-amber-200/40 px-3 text-sm font-medium text-amber-50 transition hover:bg-amber-200/10"
            onClick={onExportRawData}
            type="button"
          >
            Export raw data
          </button>
          <button
            className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-amber-50 transition hover:bg-white/10"
            onClick={onClearWarnings}
            type="button"
          >
            Clear warning
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {issues.map((issue) => (
          <div key={`${issue.key}-${issue.recordedAt}`} className="rounded-md border border-amber-200/20 bg-ink-950/70 px-3 py-2 text-sm">
            <div className="font-semibold">{issue.key}</div>
            <div className="mt-1 text-amber-100/80">{issue.message}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
