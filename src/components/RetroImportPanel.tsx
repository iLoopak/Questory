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
import type { Game } from '../types/game';

type RetroImportPanelProps = {
  games?: Game[];
  onImportGames?: (games: Game[]) => void;
};

type ImportSummary = {
  detectedGames: number;
  importedGames: number;
  scannedFiles: number;
  skippedDuplicates: number;
  unsupportedFiles: number;
};

const emptyScanSummary: RetroScanSummary = {
  detectedGames: 0,
  scannedFiles: 0,
  unsupportedFiles: 0,
};

export function RetroImportPanel({ games, onImportGames }: RetroImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [localGames, setLocalGames] = useState<Game[]>(() => games ?? loadGames());
  const [platformOverride, setPlatformOverride] = useState<RetroPlatformOverride>(autoDetectPlatformOption);
  const [detectedRoms, setDetectedRoms] = useState<DetectedRom[]>([]);
  const [selectedRomIds, setSelectedRomIds] = useState<Set<string>>(new Set());
  const [scanSummary, setScanSummary] = useState<RetroScanSummary>(emptyScanSummary);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
    folderInputRef.current?.setAttribute('directory', '');
  }, []);

  const currentGames = games ?? localGames;
  const selectableRoms = detectedRoms.filter((rom) => !rom.isDuplicate);
  const selectedImportableRoms = selectableRoms.filter((rom) => selectedRomIds.has(rom.id));
  const supportsFolderPicker = typeof HTMLInputElement !== 'undefined' && 'webkitdirectory' in HTMLInputElement.prototype;

  function scanFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    const result = scanRomFiles(files, currentGames, platformOverride);

    setDetectedRoms(result.detectedRoms);
    setSelectedRomIds(new Set(result.detectedRoms.filter((rom) => !rom.isDuplicate).map((rom) => rom.id)));
    setScanSummary(result.summary);
    setImportSummary(null);
  }

  function clearScanResults() {
    setDetectedRoms([]);
    setSelectedRomIds(new Set());
    setScanSummary(emptyScanSummary);
    setImportSummary(null);

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
    const importedGames = selectedImportableRoms.map((rom) => mapDetectedRomToGame(rom, existingGameIds, importedAt));

    if (importedGames.length === 0) {
      setImportSummary({
        detectedGames: scanSummary.detectedGames,
        importedGames: 0,
        scannedFiles: scanSummary.scannedFiles,
        skippedDuplicates: detectedRoms.filter((rom) => rom.isDuplicate).length,
        unsupportedFiles: scanSummary.unsupportedFiles,
      });
      return;
    }

    if (onImportGames) {
      onImportGames(importedGames);
    } else {
      const nextGames = [...currentGames, ...importedGames];
      setLocalGames(nextGames);
      saveGames(nextGames);
    }

    setImportSummary({
      detectedGames: scanSummary.detectedGames,
      importedGames: importedGames.length,
      scannedFiles: scanSummary.scannedFiles,
      skippedDuplicates: detectedRoms.filter((rom) => rom.isDuplicate).length,
      unsupportedFiles: scanSummary.unsupportedFiles,
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
            className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow"
            onClick={() => folderInputRef.current?.click()}
            type="button"
          >
            Select ROM folder
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
          {supportsFolderPicker
            ? 'Folder selection is available in this browser. Android APK folder access may need a later Storage Access Framework plugin.'
            : 'Folder selection is not supported here. Select multiple ROM files instead.'}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <RetroStat label="Scanned" value={scanSummary.scannedFiles.toString()} />
        <RetroStat label="Detected" value={scanSummary.detectedGames.toString()} />
        <RetroStat label="Selected" value={selectedImportableRoms.length.toString()} />
        <RetroStat label="Unsupported" value={scanSummary.unsupportedFiles.toString()} />
      </div>

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
        <div className="mt-4 rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-sm text-mint">
          Imported {importSummary.importedGames} of {importSummary.detectedGames} detected games. Skipped{' '}
          {importSummary.skippedDuplicates} duplicates and {importSummary.unsupportedFiles} unsupported files from{' '}
          {importSummary.scannedFiles} scanned files.
        </div>
      ) : null}
    </section>
  );
}

function RetroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-skyglass/15 bg-ink-950/80 p-3">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}
