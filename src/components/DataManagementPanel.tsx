import { useRef, useState } from 'react';
import {
  createQuestShelfBackup,
  parseQuestShelfBackupText,
  resetQuestShelfLocalData,
  restoreQuestShelfBackup,
  type QuestShelfBackup,
} from '../lib/backupStorage';
import {
  createPortableBackupFilename,
  portableSyncProviders,
  serializePortableBackup,
} from '../lib/portableSync';

export function DataManagementPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [includeIntegrationSettings, setIncludeIntegrationSettings] = useState(false);
  const [message, setMessage] = useState('Download a local backup before testing destructive actions.');
  const [messageTone, setMessageTone] = useState<'error' | 'info' | 'success'>('info');
  const [selectedBackup, setSelectedBackup] = useState<QuestShelfBackup | null>(null);

  function showMessage(nextMessage: string, tone: 'error' | 'info' | 'success' = 'info') {
    setMessage(nextMessage);
    setMessageTone(tone);
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
        ? 'Backup downloaded with integration settings included.'
        : 'Backup downloaded without API keys or integration settings.',
      'success',
    );
  }

  async function readBackupFile(file: File) {
    const result = parseQuestShelfBackupText(await file.text());

    if (!result.ok) {
      setSelectedBackup(null);
      showMessage(result.error, 'error');
      return;
    }

    setSelectedBackup(result.backup);
    showMessage(
      `Backup ready: exported ${formatDateTime(result.backup.metadata.exportedAt)}, version ${result.backup.metadata.appVersion}, schema ${result.backup.metadata.schemaVersion}.`,
      'success',
    );
  }

  function restoreBackup() {
    if (!selectedBackup) {
      showMessage('Choose a valid QuestShelf backup JSON file first.', 'error');
      return;
    }

    const confirmation = window.prompt(
      [
        'This will overwrite local QuestShelf data on this device.',
        'Type RESTORE to import the selected backup.',
      ].join('\n\n'),
    );

    if (confirmation !== 'RESTORE') {
      showMessage('Restore cancelled. Local data was not changed.');
      return;
    }

    restoreQuestShelfBackup(selectedBackup);
    showMessage('Backup restored. QuestShelf will reload so the restored local library is shown.', 'success');
    window.setTimeout(() => window.location.reload(), 600);
  }

  async function resetLocalData() {
    const confirmation = window.prompt('Type RESET to remove all local QuestShelf data from this device.');

    if (confirmation !== 'RESET') {
      showMessage('Reset cancelled. Local data was not changed.');
      return;
    }

    await resetQuestShelfLocalData();
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
          <h2 className="text-xl font-semibold text-white">Data Management</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Export or import portable QuestShelf backups for device moves, synced folders, and safe cleanup.
          </p>
        </div>
        <button
          className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
          onClick={downloadBackup}
          type="button"
        >
          Download backup
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
          <input
            className="mt-1 h-4 w-4 accent-mint"
            checked={includeIntegrationSettings}
            onChange={(event) => setIncludeIntegrationSettings(event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="block font-medium text-white">Include integration settings</span>
            <span className="mt-1 block text-slate-500">
              Disabled by default. Enables Steam and RAWG settings in the backup, including API keys.
            </span>
          </span>
        </label>

        <div className="rounded-md border border-skyglass/15 bg-ink-950/80 p-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              QuestShelf backup JSON
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
            Import backup
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm leading-6 text-slate-400">
        <div className="font-medium text-white">Portable sync foundation</div>
        <div className="mt-1">
          QuestShelf currently uses {portableSyncProviders[0].label.toLowerCase()} export/import.{' '}
          {portableSyncProviders[1].label} support is planned for user-owned cloud folders without accounts.
        </div>
      </div>

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
          Reset local data
        </button>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Reset removes only known QuestShelf local data from this device. It does not touch browser data from other apps.
        </p>
      </div>
    </section>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
