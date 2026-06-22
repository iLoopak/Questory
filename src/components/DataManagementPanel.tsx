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
        console.error('QuestShelf backup export failed.', error);
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
    if (mode === 'merge') {
      mergeQuestShelfBackup(selectedBackup);
    } else {
      restoreQuestShelfBackup(selectedBackup);
    }
    showMessage(t('data.backupImported'), 'success');
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
    showMessage('Local QuestShelf data was reset on this device. QuestShelf will reload.', 'success');
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
          QuestShelf currently uses {portableSyncProviders[0].label.toLowerCase()} export/import.{' '}
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
          These actions permanently remove local QuestShelf data.
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
          This will permanently remove all local QuestShelf data from this device. Type{' '}
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
