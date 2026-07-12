import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  previewLegacyGameRecovery,
  recoverGamesFromLegacyBlob,
  repairGameSnapshot,
  verifyGameStorage,
} from '../lib/gameStorage';
import {
  previewLegacyRawgMetadataCacheRecovery,
  recoverRawgMetadataCacheFromLegacyBlob,
  repairRawgMetadataCacheSnapshot,
  verifyRawgMetadataCache,
} from '../lib/rawgMetadataCache';
import {
  previewLegacyPlayActivityRecovery,
  recoverPlayActivityFromLegacyBlob,
  repairPlayActivitySnapshot,
  verifyPlayActivityStorage,
} from '../lib/playActivityStorage';
import type {
  CollectionLegacyRecoveryMode,
  CollectionLegacyRecoveryPreview,
  CollectionLegacyRecoveryResult,
  CollectionSnapshotRepairResult,
  CollectionVerification,
} from '../lib/indexedDbCollectionRepository';
import {
  clearLocalStorageIssues,
  exportRawQuestShelfLocalData,
  getLocalStorageIssues,
  storageIssueEventName,
  type LocalStorageIssue,
} from '../lib/localPersistence';
import {
  formatBytes,
  getStorageDiagnostics,
  type StorageDiagnostics,
} from '../lib/storageDiagnostics';
import { portableSyncProviders } from '../lib/portableSync';
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
import { SettingsSection, SettingsStatusBlock } from './settings/SettingsSection';
import { ViewportModal } from './ViewportModal';
import { downloadRawQuestShelfLocalData, exportQuestShelfBackupFile } from '../lib/backupExport';

function formatMessageTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, String(value)), template);
}

type DataManagementPanelProps = {
  autoBackupSignal?: string;
  onBackupExported?: () => void;
  onBackupImported?: () => void;
};

type ImportMode = 'merge' | 'replace';

export function DataManagementPanel({ autoBackupSignal, onBackupExported, onBackupImported }: DataManagementPanelProps) {
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
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<StorageDiagnostics | null>(null);
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

  // Wave 0: load the storage-health snapshot and keep issues live so a quota/write
  // failure surfaces here immediately instead of only after a reload.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let active = true;
    void getStorageDiagnostics().then((snapshot) => {
      if (active) {
        setDiagnostics(snapshot);
      }
    });

    function refreshIssues() {
      setStorageIssues(getLocalStorageIssues());
      void getStorageDiagnostics().then((snapshot) => {
        if (active) {
          setDiagnostics(snapshot);
        }
      });
    }

    window.addEventListener(storageIssueEventName, refreshIssues);
    return () => {
      active = false;
      window.removeEventListener(storageIssueEventName, refreshIssues);
    };
  }, []);

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

  const refreshDiagnostics = useCallback(() => {
    void getStorageDiagnostics().then(setDiagnostics);
  }, []);

  function showMessage(nextMessage: string, tone: 'error' | 'info' | 'success' = 'info') {
    setMessage(nextMessage);
    setMessageTone(tone);
  }

  function downloadRawLocalData() {
    downloadRawQuestShelfLocalData(exportRawQuestShelfLocalData());
    showMessage('Raw local data exported for recovery.', 'success');
  }

  function clearRecoveryWarnings() {
    clearLocalStorageIssues();
    setStorageIssues([]);
    showMessage('Storage recovery warnings cleared.');
  }

  async function downloadBackup() {
    try {
      const backup = createQuestShelfBackup(includeIntegrationSettings);
      const result = await exportQuestShelfBackupFile(backup);

      showMessage(
        includeIntegrationSettings
          ? `Backup exported as ${result.fileName} with integration settings included.`
          : `Backup exported as ${result.fileName} without API keys or integration settings.`,
        'success',
      );
      onBackupExported?.();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Questory backup export failed.', error);
      }

      const readableMessage = error instanceof Error && error.message.trim() ? ` ${error.message}` : '';
      showMessage(`Backup export failed.${readableMessage} Try again, or use a different share/save target.`, 'error');
    }
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
        void downloadBackup();
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
    showMessage('Auto-backup enabled. Questory will debounce saves after local data changes.', 'success');
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
      formatMessageTemplate(t('data.backupReady'), { exported: formatDateTime(summary.exportedAt), schema: summary.schemaVersion, libraryCount: summary.gameCount, wishlistCount: summary.wishlistCount }),
      'success',
    );
  }

  function requestRestore() {
    if (!selectedBackup) {
      showMessage(t('data.chooseBackupFirst'), 'error');
      return;
    }
    setIsRestoreModalOpen(true);
  }

  function confirmRestore(mode: 'merge' | 'replace') {
    setIsRestoreModalOpen(false);
    if (!selectedBackup) return;

    const result = mode === 'merge'
      ? mergeQuestShelfBackup(selectedBackup)
      : restoreQuestShelfBackup(selectedBackup);

    if (!result.ok) {
      // Every row in the backup's games section was corrupt. Nothing was written, so the
      // existing library is intact — say so instead of reporting success and reloading.
      showMessage(formatMessageTemplate(t('data.backupGamesUnusable'), { rows: result.games.rowCount }), 'error');
      return;
    }

    showMessage(
      result.games.rejectedCount > 0
        ? formatMessageTemplate(t('data.backupImportedWithSkippedRows'), {
            imported: result.games.acceptedCount,
            skipped: result.games.rejectedCount,
          })
        : t('data.backupImported'),
      result.games.rejectedCount > 0 ? 'info' : 'success',
    );
    onBackupImported?.();
    window.setTimeout(() => window.location.reload(), 600);
  }

  async function confirmReset() {
    setIsResetModalOpen(false);
    await resetQuestShelfLocalData();
    if (supportsFileSystemAccess) {
      await clearBackupFileHandle();
    }
    setSyncSettings(defaultSyncFolderSettings);
    setSelectedBackup(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showMessage('Local Questory data was reset on this device. Questory will reload.', 'success');
    window.setTimeout(() => window.location.reload(), 600);
  }

  return (
    <SettingsSection
      title={t('data.title')}
      description={t('data.subtitle')}
      actions={(
        <button
          className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
          onClick={() => void downloadBackup()}
          type="button"
        >
          {t('data.exportBackup')}
        </button>
      )}
      status={<SettingsStatusBlock tone={messageTone}>{message}</SettingsStatusBlock>}
    >

      <StorageRecoveryPanel
        issues={storageIssues}
        onClearWarnings={clearRecoveryWarnings}
        onExportRawData={downloadRawLocalData}
      />

      <StorageHealthPanel diagnostics={diagnostics} />

      <StorageToolsPanel
        diagnostics={diagnostics}
        onChanged={refreshDiagnostics}
        onCreateBackup={() => void downloadBackup()}
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
            <span className="qs-label-caps text-muted">
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
            onClick={requestRestore}
            type="button"
          >
            {importMode === 'merge' ? t('data.mergeBackup') : t('data.replaceBackup')}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm leading-6 text-slate-400">
        <div className="font-medium text-white">{t('data.portableSync')}</div>
        <div className="mt-1">
          Questory currently uses {portableSyncProviders[0].label.toLowerCase()} export/import.{' '}
          {portableSyncProviders[1].label} support is planned for user-owned cloud folders without accounts.
        </div>
      </div>

      {selectedBackupSummary ? (
        <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
          <div className="grid gap-2 sm:grid-cols-4">
            <BackupSummaryStat label={t('data.exported')} value={formatDateTime(selectedBackupSummary.exportedAt)} />
            <BackupSummaryStat label={t('data.schema')} value={selectedBackupSummary.schemaVersion.toString()} />
            <BackupSummaryStat label={t('collection.library')} value={selectedBackupSummary.gameCount.toString()} />
            <BackupSummaryStat label={t('collection.wishlist')} value={selectedBackupSummary.wishlistCount.toString()} />
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
            <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-900 p-3 text-sm leading-6 text-slate-300">
              <div>Selected file: {syncSettings.selectedFileName ?? 'None selected'}</div>
              <div>Last backup: {syncSettings.lastBackupAt ? formatDateTime(syncSettings.lastBackupAt) : 'Never'}</div>
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

            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
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
          </>
        ) : (
          <div className="mt-4 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
            This device cannot keep a persistent backup file handle yet. Use {t('data.exportBackup')} and {t('data.backupJson')} above, then save/load that file from your synced folder manually. Android APK builds can add a native file picker later for direct auto-backup writes.
          </div>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-red-400/30 bg-red-500/5 p-4">
        <h3 className="text-base font-semibold text-red-300">Danger Zone</h3>
        <p className="mt-1 text-sm leading-5 text-slate-400">
          These actions permanently remove local Questory data.
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-4 border-t border-red-400/20 pt-4">
          <div>
            <button
              className="h-10 rounded-md border border-red-400/40 bg-red-500/10 px-3 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
              onClick={() => setIsResetModalOpen(true)}
              type="button"
            >
              {t('data.resetLocal')}
            </button>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Removes all games, settings, and preferences from this device.
            </p>
          </div>
        </div>
      </section>

      {isResetModalOpen ? (
        <ResetConfirmModal
          onConfirm={() => void confirmReset()}
          onClose={() => setIsResetModalOpen(false)}
        />
      ) : null}

      {isRestoreModalOpen && selectedBackupSummary ? (
        <RestoreConfirmModal
          summary={selectedBackupSummary}
          onMerge={() => confirmRestore('merge')}
          onReplace={() => confirmRestore('replace')}
          onClose={() => setIsRestoreModalOpen(false)}
        />
      ) : null}

    </SettingsSection>
  );
}

function ResetConfirmModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isConfirmed = inputValue === 'RESET';

  return (
    <ViewportModal ariaLabel="Confirm data reset" placement="center" onClose={onClose} initialFocusRef={inputRef}>
      <div className="p-5">
        <h3 className="text-lg font-semibold text-white">Reset local data</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          This will permanently remove all local Questory data from this device. Type{' '}
          <span className="font-mono font-bold text-red-300">RESET</span> to confirm.
        </p>
        <input
          ref={inputRef}
          aria-label="Type RESET to confirm"
          autoComplete="off"
          className="mt-4 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-red-400"
          placeholder="RESET"
          spellCheck={false}
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
        />
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-10 rounded-md border border-red-400/40 bg-red-500/10 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!isConfirmed}
            onClick={onConfirm}
            type="button"
          >
            Reset local data
          </button>
        </div>
      </div>
    </ViewportModal>
  );
}

function RestoreConfirmModal({
  summary,
  onMerge,
  onReplace,
  onClose,
}: {
  summary: QuestShelfBackupSummary;
  onMerge: () => void;
  onReplace: () => void;
  onClose: () => void;
}) {
  return (
    <ViewportModal ariaLabel="Restore backup" placement="center" onClose={onClose}>
      <div className="p-5">
        <h3 className="text-lg font-semibold text-white">Restore backup</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Choose how imported data should be applied.
        </p>
        <div className="mt-3 grid gap-1.5 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-400">
          <div><span className="text-slate-500">Exported:</span> <span className="text-slate-200">{formatDateTime(summary.exportedAt)}</span></div>
          <div><span className="text-slate-500">Schema:</span> <span className="text-slate-200">{summary.schemaVersion}</span></div>
          <div><span className="text-slate-500">Library games:</span> <span className="text-slate-200">{summary.gameCount}</span></div>
          <div><span className="text-slate-500">Wishlist items:</span> <span className="text-slate-200">{summary.wishlistCount}</span></div>
        </div>
        <div className="mt-4 grid gap-2">
          <button
            className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            onClick={onMerge}
            type="button"
          >
            Merge existing data
          </button>
          <button
            className="h-11 rounded-md border border-red-400/40 bg-red-500/10 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-500/20"
            onClick={onReplace}
            type="button"
          >
            Replace existing data
          </button>
          <button
            className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </ViewportModal>
  );
}

function BackupSummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2">
      <div className="qs-label-caps text-muted">{label}</div>
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
            Questory found local data it could not read safely. The app used fallback defaults and did not delete the
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

function StorageHealthPanel({ diagnostics }: { diagnostics: StorageDiagnostics | null }) {
  if (!diagnostics) {
    return null;
  }

  const { local, device } = diagnostics;
  // localStorage is capped near ~5 MB per origin; warn before writes start failing.
  const localSoftLimitBytes = 5 * 1024 * 1024;
  const localFraction = Math.min(local.totalBytes / localSoftLimitBytes, 1);
  const localWarning = local.totalBytes > localSoftLimitBytes * 0.8;
  const deviceWarning = device?.usedFraction != null && device.usedFraction > 0.8;
  const tone = localWarning || deviceWarning ? 'border-amber-300/30 bg-amber-300/10' : 'border-skyglass/15 bg-ink-950/80';

  return (
    <section className={`mt-4 rounded-lg border p-4 text-sm text-slate-300 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white">Storage health</h3>
        <span className="text-xs text-slate-500">Local diagnostics</span>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        IndexedDB: {diagnostics.indexedDbAvailable ? 'available' : 'unavailable (using legacy fallback)'}
      </div>

      <div className="mt-3 rounded-md border border-skyglass/15 bg-ink-950/60 px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-slate-500">Games store</div>
        <div className="mt-1 text-sm text-slate-200">
          {diagnostics.gameStore.backend === 'indexeddb' ? 'IndexedDB' : 'Legacy blob (fallback)'}
          <span className="text-slate-500">
            {' · '}{diagnostics.gameStore.gameCount} records{' · '}schema v{diagnostics.gameStore.schemaVersion}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Legacy blob: {diagnostics.gameStore.legacyBlobPresent ? 'present (import fallback, inert)' : 'absent'}.
          {diagnostics.gameStore.migratedFromLegacy ? ' Migrated from legacy this session.' : ''}
        </div>
        {diagnostics.gameStore.lastError ? (
          <div className="mt-1 text-xs text-rose-300">Last error: {diagnostics.gameStore.lastError}</div>
        ) : null}
      </div>

      <div className="mt-3 rounded-md border border-skyglass/15 bg-ink-950/60 px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-slate-500">RAWG cache</div>
        <div className="mt-1 text-sm text-slate-200">
          {diagnostics.rawgCacheStore.backend === 'indexeddb' ? 'IndexedDB' : 'Legacy blob (fallback)'}
          <span className="text-slate-500">
            {' · '}{diagnostics.rawgCacheStore.recordCount} records{' · '}schema v{diagnostics.rawgCacheStore.schemaVersion}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Legacy blob: {diagnostics.rawgCacheStore.legacyBlobPresent ? 'present (import fallback, inert)' : 'absent'}.
          {diagnostics.rawgCacheStore.migratedFromLegacy ? ' Migrated from legacy this session.' : ''}
        </div>
        {diagnostics.rawgCacheStore.lastError ? (
          <div className="mt-1 text-xs text-rose-300">Last error: {diagnostics.rawgCacheStore.lastError}</div>
        ) : null}
      </div>

      <div className="mt-3 rounded-md border border-skyglass/15 bg-ink-950/60 px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-slate-500">Play activity</div>
        <div className="mt-1 text-sm text-slate-200">
          {diagnostics.playActivityStore.backend === 'indexeddb' ? 'IndexedDB' : 'Legacy blob (fallback)'}
          <span className="text-slate-500">
            {' · '}{diagnostics.playActivityStore.recordCount} records{' · '}schema v{diagnostics.playActivityStore.schemaVersion}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Legacy blob: {diagnostics.playActivityStore.legacyBlobPresent ? 'present (import fallback, inert)' : 'absent'}.
          {diagnostics.playActivityStore.migratedFromLegacy ? ' Migrated from legacy this session.' : ''}
        </div>
        {diagnostics.playActivityStore.lastError ? (
          <div className="mt-1 text-xs text-rose-300">Last error: {diagnostics.playActivityStore.lastError}</div>
        ) : null}
      </div>


      <div className="mt-3 rounded-md border border-skyglass/15 bg-ink-950/60 px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-slate-500">Discovery and artwork caches</div>
        <div className="mt-1 text-sm text-slate-200">
          {diagnostics.appCacheStore.backend === 'indexeddb' ? 'IndexedDB' : 'Unavailable'}
          <span className="text-slate-500">
            {' · '}{diagnostics.appCacheStore.keyCount} cache entries
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Screenshots, recommendations, and release-calendar caches are kept out of localStorage. Legacy blobs migrate on first use and are removed after verification.
        </div>
        {diagnostics.appCacheStore.lastError ? (
          <div className="mt-1 text-xs text-rose-300">Last error: {diagnostics.appCacheStore.lastError}</div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-skyglass/15 bg-ink-950/60 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Questory local data</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-white">{formatBytes(local.totalBytes)}</div>
          <div className="mt-1 text-xs text-slate-500">{local.keyCount} keys · games {formatBytes(local.gamesBytes)}</div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-900">
            <div
              className={`h-full rounded-full ${localWarning ? 'bg-amber-300' : 'bg-mint'}`}
              style={{ width: `${Math.max(localFraction * 100, 1)}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-slate-500">~{Math.round(localFraction * 100)}% of the ~5 MB localStorage limit</div>
        </div>

        <div className="rounded-md border border-skyglass/15 bg-ink-950/60 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Device storage estimate</div>
          {device ? (
            <>
              <div className="mt-1 text-lg font-semibold tabular-nums text-white">
                {formatBytes(device.usageBytes)}
                {device.quotaBytes > 0 ? <span className="text-sm font-normal text-slate-500"> / {formatBytes(device.quotaBytes)}</span> : null}
              </div>
              {device.usedFraction != null ? (
                <div className="mt-1 text-xs text-slate-500">~{Math.round(device.usedFraction * 100)}% of the browser quota used</div>
              ) : null}
            </>
          ) : (
            <div className="mt-1 text-xs text-slate-500">Not available in this environment.</div>
          )}
        </div>
      </div>

      {localWarning ? (
        <p className="mt-3 text-xs text-amber-200/90">
          Local storage is close to the browser limit. Export a backup; a future update will move the library to a
          larger-capacity store.
        </p>
      ) : null}
    </section>
  );
}

type ToolResult = { tone: 'ok' | 'warn' | 'error'; text: string };

type StoreToolsActions = {
  verify: () => Promise<CollectionVerification>;
  repair: () => Promise<CollectionSnapshotRepairResult>;
  previewRecovery: () => Promise<CollectionLegacyRecoveryPreview>;
  recover: (mode: CollectionLegacyRecoveryMode) => Promise<CollectionLegacyRecoveryResult>;
};

const toolButtonClass =
  'h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50';

function StoreToolsRow({
  label,
  noun,
  legacyBlobPresent,
  actions,
  onChanged,
}: {
  label: string;
  noun: string;
  legacyBlobPresent: boolean;
  actions: StoreToolsActions;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [preview, setPreview] = useState<CollectionLegacyRecoveryPreview | null>(null);

  const resultTone =
    result?.tone === 'error' ? 'text-rose-200' : result?.tone === 'warn' ? 'text-amber-200' : 'text-emerald-200';

  async function runVerify() {
    setBusy('verify');
    setResult(null);
    try {
      const v = await actions.verify();
      const clean = v.invalidCount === 0 && v.duplicateIds.length === 0;
      setResult({
        tone: clean ? 'ok' : 'warn',
        text:
          `IndexedDB ${v.idbAvailable ? 'available' : 'unavailable'} · ${v.idbRowCount} rows · ` +
          `${v.validCount} valid · ${v.invalidCount} invalid · ${v.duplicateIds.length} duplicate ids · ` +
          `snapshot ${v.snapshotCount} · legacy blob ${v.legacyBlobPresent ? `${v.legacyBlobCount} records` : 'absent'}.`,
      });
    } catch (error) {
      setResult({ tone: 'error', text: error instanceof Error ? error.message : 'Verification failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function runRepair() {
    setBusy('repair');
    setResult(null);
    try {
      const r = await actions.repair();
      setResult({
        tone: 'ok',
        text: `Rebuilt snapshot from IndexedDB: ${r.after} records${r.removedInvalid > 0 ? ` (excluded ${r.removedInvalid} invalid row${r.removedInvalid === 1 ? '' : 's'})` : ''}.`,
      });
      onChanged();
    } catch (error) {
      setResult({ tone: 'error', text: error instanceof Error ? error.message : 'Repair failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function startRecovery() {
    setBusy('recover');
    setResult(null);
    try {
      const pv = await actions.previewRecovery();
      if (!pv.legacyBlobPresent || pv.legacyCount === 0) {
        setResult({ tone: 'warn', text: `No legacy ${noun} blob to recover from.` });
        setPreview(null);
        return;
      }
      setPreview(pv);
    } catch (error) {
      setResult({ tone: 'error', text: error instanceof Error ? error.message : 'Recovery preview failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function doRecover(mode: CollectionLegacyRecoveryMode) {
    if (
      mode === 'replace' &&
      !window.confirm(
        `Replace all ${preview?.idbCount ?? 0} ${noun} records in IndexedDB with ${preview?.legacyCount ?? 0} from the legacy blob? This overwrites current data.`,
      )
    ) {
      return;
    }
    setBusy(mode);
    try {
      const res = await actions.recover(mode);
      setResult({
        tone: 'ok',
        text:
          `${mode === 'merge' ? 'Merged' : 'Replaced'}: imported ${res.importedCount}, total ${res.totalCount}` +
          `${res.skippedExistingCount > 0 ? `, kept ${res.skippedExistingCount} existing` : ''}.`,
      });
      setPreview(null);
      onChanged();
    } catch (error) {
      setResult({ tone: 'error', text: error instanceof Error ? error.message : 'Recovery failed.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-skyglass/15 bg-ink-950/60 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={toolButtonClass} disabled={busy !== null} onClick={() => void runVerify()} type="button">
          {busy === 'verify' ? 'Verifying…' : 'Verify'}
        </button>
        <button className={toolButtonClass} disabled={busy !== null} onClick={() => void runRepair()} type="button">
          {busy === 'repair' ? 'Repairing…' : 'Repair snapshot'}
        </button>
        <button
          className={toolButtonClass}
          disabled={busy !== null || !legacyBlobPresent}
          onClick={() => void startRecovery()}
          title={legacyBlobPresent ? undefined : `No legacy ${noun} blob present.`}
          type="button"
        >
          {busy === 'recover' ? 'Checking…' : 'Recover from legacy blob'}
        </button>
      </div>

      {preview ? (
        <div className="mt-2 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-amber-100">
          <div className="text-sm">
            Legacy blob: {preview.legacyCount} records · IndexedDB: {preview.idbCount} records ·{' '}
            {preview.onlyInLegacyCount} only in legacy · {preview.conflictCount} already present.
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={toolButtonClass} disabled={busy !== null} onClick={() => void doRecover('merge')} type="button">
              {busy === 'merge' ? 'Merging…' : `Merge (add ${preview.onlyInLegacyCount})`}
            </button>
            <button className={toolButtonClass} disabled={busy !== null} onClick={() => void doRecover('replace')} type="button">
              {busy === 'replace' ? 'Replacing…' : 'Replace all'}
            </button>
            <button className={toolButtonClass} disabled={busy !== null} onClick={() => setPreview(null)} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {result ? <p className={`mt-2 text-xs leading-5 ${resultTone}`}>{result.text}</p> : null}
    </div>
  );
}

function StorageToolsPanel({
  diagnostics,
  onChanged,
  onCreateBackup,
}: {
  diagnostics: StorageDiagnostics | null;
  onChanged: () => void;
  onCreateBackup: () => void;
}) {
  return (
    <section className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-4 text-sm text-slate-300">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white">Storage tools</h3>
        <span className="text-xs text-slate-500">Verify · repair · recover</span>
      </div>

      <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
        Non-destructive checks for the IndexedDB-backed stores. Repair only rebuilds the in-memory snapshot; recovery
        imports the legacy blob and never overwrites it. Export a backup first if you plan to replace data.
      </p>

      <StoreToolsRow
        label="Games"
        noun="games"
        legacyBlobPresent={diagnostics?.gameStore.legacyBlobPresent ?? false}
        actions={{
          verify: verifyGameStorage,
          repair: repairGameSnapshot,
          previewRecovery: previewLegacyGameRecovery,
          recover: recoverGamesFromLegacyBlob,
        }}
        onChanged={onChanged}
      />

      <StoreToolsRow
        label="RAWG cache"
        noun="RAWG cache"
        legacyBlobPresent={diagnostics?.rawgCacheStore.legacyBlobPresent ?? false}
        actions={{
          verify: verifyRawgMetadataCache,
          repair: repairRawgMetadataCacheSnapshot,
          previewRecovery: previewLegacyRawgMetadataCacheRecovery,
          recover: recoverRawgMetadataCacheFromLegacyBlob,
        }}
        onChanged={onChanged}
      />

      <StoreToolsRow
        label="Play activity"
        noun="play activity"
        legacyBlobPresent={diagnostics?.playActivityStore.legacyBlobPresent ?? false}
        actions={{
          verify: verifyPlayActivityStorage,
          repair: repairPlayActivitySnapshot,
          previewRecovery: previewLegacyPlayActivityRecovery,
          recover: recoverPlayActivityFromLegacyBlob,
        }}
        onChanged={onChanged}
      />

      <div className="mt-3">
        <button className={toolButtonClass} onClick={onCreateBackup} type="button">
          Create backup now
        </button>
      </div>
    </section>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
