import { useEffect, useRef, useState } from 'react';
import { loadGames, saveGames } from '../lib/gameStorage';
import {
  autoDetectPlatformOption,
  mapDetectedRomToGame,
  retroImportPlatforms,
  scanRomFiles,
  type DetectedRom,
  type RetroPlatformOverride,
  type RetroScanSummary,
} from '../lib/retroRomImport';
import { getRuntimeEnvironment } from '../lib/capacitorEnvironment';
import type { Game } from '../types/game';

type RetroImportPanelProps = {
  games?: Game[];
  importedGamesHiddenByFilters?: boolean;
  onAddImportedToQueue?: (gameIds: string[]) => void;
  onClearLibraryFilters?: () => void;
  onEnrichImportedGames?: (gameIds: string[]) => void;
  onImportGames?: (games: Game[]) => Game[];
  onReviewImportedGames?: (gameIds: string[]) => void;
  onViewImportedGames?: (gameIds: string[]) => void;
};

type ImportSummary = {
  detectedGames: number;
  failures: string[];
  importedGames: number;
  scannedFiles: number;
  skippedDuplicates: number;
  unsupportedFiles: number;
  warning: string | null;
};

const emptyScanSummary: RetroScanSummary = {
  detectedGames: 0,
  scanIssues: [],
  scannedFiles: 0,
  unsupportedFiles: 0,
};

export function RetroImportPanel({
  games,
  importedGamesHiddenByFilters = false,
  onAddImportedToQueue,
  onClearLibraryFilters,
  onEnrichImportedGames,
  onImportGames,
  onReviewImportedGames,
  onViewImportedGames,
}: RetroImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const runtimeEnvironment = getRuntimeEnvironment();
  const [localGames, setLocalGames] = useState<Game[]>(() => games ?? loadGames());
  const [platformOverride, setPlatformOverride] = useState<RetroPlatformOverride>(autoDetectPlatformOption);
  const [detectedRoms, setDetectedRoms] = useState<DetectedRom[]>([]);
  const [importedGames, setImportedGames] = useState<Game[]>([]);
  const [selectedRomIds, setSelectedRomIds] = useState<Set<string>>(new Set());
  const [scanSummary, setScanSummary] = useState<RetroScanSummary>(emptyScanSummary);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    message: string;
    tone: 'error' | 'info' | 'success' | 'warning';
  }>({
    message: 'Select ROM files to validate them before importing.',
    tone: 'info',
  });

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
    folderInputRef.current?.setAttribute('directory', '');
  }, []);

  const currentGames = games ?? localGames;
  const selectableRoms = detectedRoms.filter((rom) => !rom.isDuplicate);
  const selectedImportableRoms = selectableRoms.filter((rom) => selectedRomIds.has(rom.id));
  const supportsFolderPicker =
    !runtimeEnvironment.isAndroid &&
    typeof HTMLInputElement !== 'undefined' &&
    'webkitdirectory' in HTMLInputElement.prototype;

  function scanFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    console.debug('[QuestShelf Retro Import] scan started', {
      fileCount: files.length,
      platformOverride,
      runtime: runtimeEnvironment,
    });

    if (files.length === 0) {
      setDetectedRoms([]);
      setSelectedRomIds(new Set());
      setScanSummary(emptyScanSummary);
      setImportSummary({
        detectedGames: 0,
        failures: ['No files were selected.'],
        importedGames: 0,
        scannedFiles: 0,
        skippedDuplicates: 0,
        unsupportedFiles: 0,
        warning: 'No files were selected. Choose one or more ROM files and try again.',
      });
      setImportedGames([]);
      setStatusMessage({
        message: 'No files were selected. Choose one or more ROM files and try again.',
        tone: 'warning',
      });
      return;
    }

    const result = scanRomFiles(files, currentGames, platformOverride);

    console.debug('[QuestShelf Retro Import] scan finished', result.summary);
    setDetectedRoms(result.detectedRoms);
    setSelectedRomIds(new Set(result.detectedRoms.filter((rom) => !rom.isDuplicate).map((rom) => rom.id)));
    setScanSummary(result.summary);
    setImportSummary(null);
    setImportedGames([]);
    setStatusMessage(getScanStatusMessage(result.summary));
  }

  function clearScanResults() {
    setDetectedRoms([]);
    setImportedGames([]);
    setSelectedRomIds(new Set());
    setScanSummary(emptyScanSummary);
    setImportSummary(null);
    setStatusMessage({
      message: 'Scan cleared. Select ROM files to start again.',
      tone: 'info',
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  }

  function toggleRom(romId: string) {
    setSelectedRomIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      if (nextSelection.has(romId)) {
        nextSelection.delete(romId);
      } else {
        nextSelection.add(romId);
      }

      return nextSelection;
    });
  }

  function selectAllDetected() {
    setSelectedRomIds(new Set(selectableRoms.map((rom) => rom.id)));
  }

  function deselectAllDetected() {
    setSelectedRomIds(new Set());
  }

  function importSelectedRoms() {
    const existingGameIds = new Set(currentGames.map((game) => game.id));
    const importedAt = new Date().toISOString();
    const candidateGames = selectedImportableRoms.map((rom) => mapDetectedRomToGame(rom, existingGameIds, importedAt));
    const duplicateCount = detectedRoms.filter((rom) => rom.isDuplicate).length;
    const failures = getImportFailures(candidateGames);

    console.debug('[QuestShelf Retro Import] import requested', {
      candidates: candidateGames.length,
      selected: selectedImportableRoms.length,
      summary: scanSummary,
    });

    if (candidateGames.length === 0 || failures.length > 0) {
      const warning = createZeroImportWarning({
        candidateCount: candidateGames.length,
        duplicateCount,
        failures,
        scanSummary,
      });
      setImportSummary({
        detectedGames: scanSummary.detectedGames,
        failures,
        importedGames: 0,
        scannedFiles: scanSummary.scannedFiles,
        skippedDuplicates: duplicateCount,
        unsupportedFiles: scanSummary.unsupportedFiles,
        warning,
      });
      setImportedGames([]);
      setStatusMessage({ message: warning, tone: 'warning' });
      console.warn('[QuestShelf Retro Import] import blocked', { failures, scanSummary });
      return;
    }

    let createdGames: Game[] = [];

    try {
      if (onImportGames) {
        createdGames = onImportGames(candidateGames);
      } else {
        const nextGames = [...currentGames, ...candidateGames];
        saveGames(nextGames);
        setLocalGames(nextGames);
        createdGames = candidateGames;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Storage failed while importing retro games.';
      setImportSummary({
        detectedGames: scanSummary.detectedGames,
        failures: [message],
        importedGames: 0,
        scannedFiles: scanSummary.scannedFiles,
        skippedDuplicates: duplicateCount,
        unsupportedFiles: scanSummary.unsupportedFiles,
        warning: 'QuestShelf could not save the imported games. Local data was not changed.',
      });
      setImportedGames([]);
      setStatusMessage({
        message: 'QuestShelf could not save the imported games. Local data was not changed.',
        tone: 'error',
      });
      console.error('[QuestShelf Retro Import] storage failure', error);
      return;
    }

    if (createdGames.length === 0) {
      const warning = createZeroImportWarning({
        candidateCount: candidateGames.length,
        duplicateCount,
        failures: ['All selected games were rejected as duplicates or invalid records.'],
        scanSummary,
      });
      setImportSummary({
        detectedGames: scanSummary.detectedGames,
        failures: ['All selected games were rejected as duplicates or invalid records.'],
        importedGames: 0,
        scannedFiles: scanSummary.scannedFiles,
        skippedDuplicates: duplicateCount,
        unsupportedFiles: scanSummary.unsupportedFiles,
        warning,
      });
      setImportedGames([]);
      setStatusMessage({ message: warning, tone: 'warning' });
      console.warn('[QuestShelf Retro Import] no records created', { candidateGames });
      return;
    }

    setImportSummary({
      detectedGames: scanSummary.detectedGames,
      failures: [],
      importedGames: createdGames.length,
      scannedFiles: scanSummary.scannedFiles,
      skippedDuplicates: duplicateCount,
      unsupportedFiles: scanSummary.unsupportedFiles,
      warning: null,
    });
    setImportedGames(createdGames);
    setStatusMessage({
      message: `Imported ${createdGames.length} retro ${createdGames.length === 1 ? 'game' : 'games'} into Library.`,
      tone: 'success',
    });
    setDetectedRoms((currentRoms) =>
      currentRoms.map((rom) =>
        selectedRomIds.has(rom.id)
          ? {
              ...rom,
              duplicateReason: 'Imported this session',
              isDuplicate: true,
            }
          : rom,
      ),
    );
    setSelectedRomIds(new Set());
    console.info('[QuestShelf Retro Import] import complete', {
      importedIds: createdGames.map((game) => game.id),
      importedCount: createdGames.length,
    });
  }

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Retro ROM Import</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Import emulator library entries from files you explicitly select. QuestShelf reads filenames only and never uploads or copies ROM data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            Select ROM files
          </button>
          <button
            className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            disabled={!supportsFolderPicker}
            onClick={() => folderInputRef.current?.click()}
            type="button"
          >
            {runtimeEnvironment.isAndroid ? 'Folder import pending SAF' : 'Select ROM folder'}
          </button>
        </div>
      </div>

      <input ref={fileInputRef} className="hidden" multiple onChange={(event) => scanFiles(event.target.files)} type="file" />
      <input ref={folderInputRef} className="hidden" multiple onChange={(event) => scanFiles(event.target.files)} type="file" />

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Platform override</span>
          <select
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
            onChange={(event) => setPlatformOverride(event.target.value as RetroPlatformOverride)}
            value={platformOverride}
          >
            <option value={autoDetectPlatformOption}>{autoDetectPlatformOption}</option>
            {retroImportPlatforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm leading-6 text-slate-300">
          {runtimeEnvironment.isAndroid
            ? 'Android APK folder import needs a later Storage Access Framework bridge. Select one or more ROM files for the current local-first workflow.'
            : supportsFolderPicker
              ? 'Folder selection is available on this device. QuestShelf still validates every file before import.'
              : 'Folder selection is not supported on this device. Select multiple ROM files instead.'}
        </div>
      </div>

      <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${getStatusClassName(statusMessage.tone)}`}>
        {statusMessage.message}
      </div>

      {scanSummary.scanIssues.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          <div className="font-semibold">Scan notes</div>
          <ul className="mt-2 space-y-1">
            {scanSummary.scanIssues.slice(0, 6).map((issue) => (
              <li key={`${issue.type}-${issue.fileName}-${issue.reason}`}>
                {issue.fileName}: {issue.reason}
              </li>
            ))}
          </ul>
          {scanSummary.scanIssues.length > 6 ? (
            <div className="mt-2 text-amber-100/80">+{scanSummary.scanIssues.length - 6} more notes</div>
          ) : null}
        </div>
      ) : null}

      {detectedRoms.length > 0 ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm text-slate-200 transition hover:bg-mint/10 hover:text-white" onClick={selectAllDetected} type="button">
              Select all
            </button>
            <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm text-slate-200 transition hover:bg-mint/10 hover:text-white" onClick={deselectAllDetected} type="button">
              Deselect all
            </button>
            <button
              className="h-9 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
              disabled={selectedImportableRoms.length === 0}
              onClick={importSelectedRoms}
              type="button"
            >
              Import detected games
            </button>
            <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm text-slate-200 transition hover:bg-mint/10 hover:text-white" onClick={clearScanResults} type="button">
              Clear scan results
            </button>
          </div>

          <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-skyglass/15 bg-ink-950/60">
            <div className="divide-y divide-white/10">
              {detectedRoms.map((rom) => (
                <label
                  key={rom.id}
                  className={`grid gap-3 p-3 text-sm sm:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] sm:items-center ${
                    rom.isDuplicate ? 'text-slate-500' : 'text-slate-200'
                  }`}
                >
                  <input
                    checked={selectedRomIds.has(rom.id)}
                    className="h-4 w-4 accent-mint"
                    disabled={rom.isDuplicate}
                    onChange={() => toggleRom(rom.id)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white" title={rom.title}>
                      {rom.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500" title={rom.fileName}>
                      {rom.fileName}
                    </span>
                  </span>
                  <span className="truncate">{rom.platform}</span>
                  <span className="truncate text-xs text-slate-500" title={rom.sourcePath}>
                    {rom.sourcePath}
                  </span>
                  <span className="flex flex-wrap justify-start gap-2 sm:justify-end">
                    <span className="rounded-full border border-skyglass/15 bg-ink-900 px-2 py-1 text-xs text-slate-300">
                      .{rom.extension}
                    </span>
                    {rom.isDuplicate ? (
                      <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                        {rom.duplicateReason}
                      </span>
                    ) : (
                      <span className="rounded-full border border-mint/30 bg-mint/10 px-2 py-1 text-xs text-mint">
                        Ready
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-skyglass/20 bg-ink-950/60 p-4 text-sm leading-6 text-slate-400">
          Select ROM files or a folder to preview detected games before importing them into the Library.
        </div>
      )}

      {importSummary ? (
        <ImportResultPanel
          importedGames={importedGames}
          importedGamesHiddenByFilters={importedGamesHiddenByFilters}
          summary={importSummary}
          onAddImportedToQueue={onAddImportedToQueue}
          onClearLibraryFilters={onClearLibraryFilters}
          onEnrichImportedGames={onEnrichImportedGames}
          onReviewImportedGames={onReviewImportedGames}
          onViewImportedGames={onViewImportedGames}
        />
      ) : null}
    </section>
  );
}

function ImportResultPanel({
  importedGames,
  importedGamesHiddenByFilters,
  summary,
  onAddImportedToQueue,
  onClearLibraryFilters,
  onEnrichImportedGames,
  onReviewImportedGames,
  onViewImportedGames,
}: {
  importedGames: Game[];
  importedGamesHiddenByFilters: boolean;
  summary: ImportSummary;
  onAddImportedToQueue?: (gameIds: string[]) => void;
  onClearLibraryFilters?: () => void;
  onEnrichImportedGames?: (gameIds: string[]) => void;
  onReviewImportedGames?: (gameIds: string[]) => void;
  onViewImportedGames?: (gameIds: string[]) => void;
}) {
  const importedGameIds = importedGames.map((game) => game.id);
  const isSuccess = summary.importedGames > 0;

  return (
    <section
      className={`mt-4 rounded-lg border p-4 ${
        isSuccess ? 'border-mint/30 bg-mint/10 text-mint' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {isSuccess ? 'Retro import complete' : 'Retro import needs attention'}
          </h3>
          <p className="mt-1 text-sm leading-6">
            {summary.warning ??
              `Imported ${summary.importedGames} of ${summary.detectedGames} detected games into Library.`}
          </p>
        </div>
      </div>

      {summary.failures.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {summary.failures.map((failure) => (
            <li key={failure}>{failure}</li>
          ))}
        </ul>
      ) : null}

      {isSuccess ? (
        <>
          {importedGamesHiddenByFilters ? (
            <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
              Library filters may hide these imported games.
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
              onClick={() => onReviewImportedGames?.(importedGameIds)}
              type="button"
            >
              Review imported games
            </button>
            <button
              className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
              onClick={() => onViewImportedGames?.(importedGameIds)}
              type="button"
            >
              View in Library
            </button>
            <button
              className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20"
              onClick={() => onEnrichImportedGames?.(importedGameIds)}
              type="button"
            >
              Enrich imported games
            </button>
            <button
              className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
              onClick={() => onAddImportedToQueue?.(importedGameIds)}
              type="button"
            >
              Add to queue
            </button>
            {importedGamesHiddenByFilters ? (
              <button
                className="h-10 rounded-md border border-amber-300/30 px-3 text-sm font-medium text-amber-100 transition hover:bg-amber-300/10"
                onClick={onClearLibraryFilters}
                type="button"
              >
                Clear filters
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {importedGames.map((game) => (
              <article key={game.id} className="rounded-md border border-mint/20 bg-ink-950/80 p-3 text-slate-200">
                <div className="truncate font-semibold text-white">{game.title}</div>
                <div className="mt-1 text-sm text-slate-400">{game.platform}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-mint/20 bg-mint/10 px-2 py-1 text-mint">
                    {game.externalSource}
                  </span>
                  <span className="rounded-full border border-skyglass/15 bg-ink-900 px-2 py-1 text-slate-300">
                    .{game.romExtension}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function getImportFailures(games: Game[]) {
  return games.flatMap((game) => {
    const failures: string[] = [];

    if (!game.id.trim()) {
      failures.push('A generated game record was missing an ID.');
    }

    if (!game.title.trim()) {
      failures.push('A generated game record was missing a title.');
    }

    if (game.collectionType !== 'library') {
      failures.push(`${game.title || game.id} was not created as a Library game.`);
    }

    if (game.externalSource !== 'retro-rom') {
      failures.push(`${game.title || game.id} was not marked as a retro ROM import.`);
    }

    if (!game.romPath && !game.romUri) {
      failures.push(`${game.title || game.id} did not keep a ROM path or URI reference.`);
    }

    return failures;
  });
}

function getScanStatusMessage(summary: RetroScanSummary) {
  if (summary.scannedFiles === 0) {
    return {
      message: 'No files were selected. Choose one or more ROM files and try again.',
      tone: 'warning' as const,
    };
  }

  if (summary.detectedGames === 0) {
    return {
      message: 'No supported ROMs were detected. Check the file type or select a different platform folder.',
      tone: 'warning' as const,
    };
  }

  if (summary.detectedGames === summary.scanIssues.filter((issue) => issue.type === 'duplicate').length) {
    return {
      message: 'All detected ROMs already exist in your Library.',
      tone: 'warning' as const,
    };
  }

  return {
    message: `${summary.detectedGames} supported ROM ${summary.detectedGames === 1 ? 'entry is' : 'entries are'} ready to review.`,
    tone: 'success' as const,
  };
}

function createZeroImportWarning({
  candidateCount,
  duplicateCount,
  failures,
  scanSummary,
}: {
  candidateCount: number;
  duplicateCount: number;
  failures: string[];
  scanSummary: RetroScanSummary;
}) {
  if (scanSummary.scannedFiles === 0) {
    return 'No files were selected. Choose one or more ROM files and try again.';
  }

  if (scanSummary.detectedGames === 0) {
    return 'No supported ROM formats were detected, so no Library games were created.';
  }

  if (candidateCount === 0 && duplicateCount > 0) {
    return 'Every detected ROM is already in your Library, so no new games were created.';
  }

  if (failures.length > 0) {
    return 'QuestShelf found validation issues and did not create any Library games.';
  }

  return 'No games were created. Review the scan notes and try again.';
}

function getStatusClassName(tone: 'error' | 'info' | 'success' | 'warning') {
  if (tone === 'error') {
    return 'border-red-400/40 bg-red-500/10 text-red-200';
  }

  if (tone === 'success') {
    return 'border-mint/30 bg-mint/10 text-mint';
  }

  if (tone === 'warning') {
    return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  }

  return 'border-skyglass/15 bg-ink-950/80 text-slate-300';
}
