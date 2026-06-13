import { useEffect, useMemo, useRef, useState } from 'react';
import { addActiveQueuePlatform, addGameToPlatformQueue, getActiveQueuePlatforms, type PlatformQueueState } from '../lib/platformQueueStorage';
import { loadSteamSettings, saveSteamSettings } from '../lib/steamSettingsStorage';
import { getOwnedGames, getRecentlyPlayedGames, getSteamPlayerSummary, mapSteamGamesToLocalGames, SteamApiError } from '../services/steamApi';
import { autoDetectPlatformOption, mapDetectedRomToGame, retroImportPlatforms, scanRomFiles, type RetroPlatformOverride, type ScannableRomFile } from '../lib/retroRomImport';
import { getRuntimeEnvironment } from '../lib/capacitorEnvironment';
import { RetroFolderPicker } from '../lib/retroFolderPicker';
import { onboardingItemIds, type OnboardingItemId } from '../lib/onboardingStorage';
import { gamePlatforms, type Game, type GamePlatform } from '../types/game';
import type { SteamSettings } from '../types/steam';
import type { AccentColorPreference, ThemePreference } from '../lib/themePreferences';

type OnboardingChecklistProps = {
  accentColorPreference: AccentColorPreference;
  completedItemIds: Set<OnboardingItemId>;
  games: Game[];
  isSettingsPanel?: boolean;
  onAccentColorChange: (color: AccentColorPreference) => void;
  onClose?: () => void;
  onComplete: (itemId: OnboardingItemId) => void;
  onImportGames: (games: Game[]) => void;
  onOpenLibrary: () => void;
  onOpenQueue: () => void;
  onPlatformQueueStateChange: (state: PlatformQueueState) => void;
  onSkip: (itemId: OnboardingItemId) => void;
  onSteamLibraryImported?: () => void;
  onSteamProfileNameChange?: (profileName: string) => void;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  platformQueueState: PlatformQueueState;
  skippedItemIds: Set<OnboardingItemId>;
  themePreference: ThemePreference;
};

type WizardStep = {
  id: (typeof onboardingItemIds)[number];
  title: string;
  isConfigured: () => boolean;
};

const preferredPlatformOptions: GamePlatform[] = [
  'Steam', 'PS5', 'PS4', 'Xbox Series X|S', 'Xbox One', 'Switch', 'Switch 2', 'PC', 'Steam Deck', 'Android',
  'PSP', 'PS Vita', 'PS2', 'PS1', 'GameCube', 'Wii', 'Wii U', 'Dreamcast', 'Game Boy Advance', 'SNES', 'NES', 'Other',
];

export function OnboardingChecklist({
  accentColorPreference,
  completedItemIds,
  games,
  isSettingsPanel = false,
  onAccentColorChange,
  onClose,
  onComplete,
  onImportGames,
  onOpenLibrary,
  onOpenQueue,
  onPlatformQueueStateChange,
  onSkip,
  onSteamLibraryImported,
  onSteamProfileNameChange,
  onThemePreferenceChange,
  platformQueueState,
  skippedItemIds,
  themePreference,
}: OnboardingChecklistProps) {
  const activePlatforms = useMemo(() => getActiveQueuePlatforms(platformQueueState), [platformQueueState]);
  const retroFolderCount = games.filter((game) => game.collectionType === 'library' && game.externalSource === 'retro-rom').length;
  const queueCount = platformQueueState.entries.length;
  const steamImported = games.some((game) => game.collectionType === 'library' && game.externalSource === 'steam');
  const steps = useMemo<WizardStep[]>(() => [
    { id: 'steam-connect', title: 'Steam Account', isConfigured: () => steamImported || Boolean(loadSteamSettings().steamId64.trim() && loadSteamSettings().apiKey.trim()) },
    { id: 'platforms', title: 'Active Platforms', isConfigured: () => activePlatforms.length > 0 },
    { id: 'retro-import', title: 'Retro ROM Locations', isConfigured: () => retroFolderCount > 0 },
    { id: 'visual-preferences', title: 'Visual Preferences', isConfigured: () => Boolean(themePreference) },
    { id: 'queue-game', title: 'Queue Setup', isConfigured: () => queueCount > 0 },
    { id: 'ready', title: 'Finish', isConfigured: () => false },
  ], [activePlatforms.length, queueCount, retroFolderCount, steamImported, themePreference]);

  useEffect(() => {
    steps.forEach((step) => {
      if (step.id !== 'ready' && step.isConfigured() && !completedItemIds.has(step.id)) {
        onComplete(step.id);
      }
    });
  }, [completedItemIds, onComplete, steps]);

  const activeStep = steps.find((step) => !completedItemIds.has(step.id) && !skippedItemIds.has(step.id)) ?? steps[steps.length - 1];
  const finishedCount = steps.filter((step) => completedItemIds.has(step.id) || skippedItemIds.has(step.id)).length;
  const progressPercent = Math.round((finishedCount / steps.length) * 100);

  return (
    <section className={`qs-setup-card rounded-lg border p-4 ${isSettingsPanel ? '' : 'shadow-panel'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Setup wizard</div>
          <h2 className="mt-1 text-lg font-semibold text-white">Configure QuestShelf</h2>
        </div>
        {onClose ? <button className="h-10 rounded-md border border-skyglass/15 px-3 text-sm text-slate-200 hover:bg-mint/10" onClick={onClose} type="button">Hide</button> : null}
      </div>
      <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-950/70 p-3">
        <div className="flex justify-between text-xs font-semibold uppercase tracking-[0.14em] text-slate-400"><span>{activeStep.title}</span><span>{progressPercent}%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-mint" style={{ width: `${progressPercent}%` }} /></div>
      </div>
      <div className="mt-4 rounded-lg border border-mint/25 bg-ink-950/80 p-4">
        {activeStep.id === 'steam-connect' ? <SteamStep games={games} onComplete={() => onComplete('steam-connect')} onImportGames={onImportGames} onSkip={() => onSkip('steam-connect')} onSteamLibraryImported={onSteamLibraryImported} onSteamProfileNameChange={onSteamProfileNameChange} /> : null}
        {activeStep.id === 'platforms' ? <PlatformsStep activePlatforms={activePlatforms} onComplete={() => onComplete('platforms')} onPlatformQueueStateChange={onPlatformQueueStateChange} onSkip={() => onSkip('platforms')} queueState={platformQueueState} /> : null}
        {activeStep.id === 'retro-import' ? <RetroStep games={games} onComplete={() => onComplete('retro-import')} onImportGames={onImportGames} onSkip={() => onSkip('retro-import')} /> : null}
        {activeStep.id === 'visual-preferences' ? <VisualStep accentColorPreference={accentColorPreference} onAccentColorChange={onAccentColorChange} onComplete={() => onComplete('visual-preferences')} onThemePreferenceChange={onThemePreferenceChange} themePreference={themePreference} /> : null}
        {activeStep.id === 'queue-game' ? <QueueStep games={games} onComplete={() => onComplete('queue-game')} onImportGames={onImportGames} onPlatformQueueStateChange={onPlatformQueueStateChange} onSkip={() => onSkip('queue-game')} queueState={platformQueueState} /> : null}
        {activeStep.id === 'ready' ? <FinishStep activePlatforms={activePlatforms.length} onComplete={() => onComplete('ready')} onOpenLibrary={onOpenLibrary} onOpenQueue={onOpenQueue} queueCount={queueCount} retroFolderCount={retroFolderCount} steamImported={steamImported} /> : null}
      </div>
    </section>
  );
}

function SteamStep({ games, onComplete, onImportGames, onSkip, onSteamLibraryImported, onSteamProfileNameChange }: { games: Game[]; onComplete: () => void; onImportGames: (games: Game[]) => void; onSkip: () => void; onSteamLibraryImported?: () => void; onSteamProfileNameChange?: (profileName: string) => void }) {
  const [settings, setSettings] = useState<SteamSettings>(() => loadSteamSettings());
  const [status, setStatus] = useState('Enter your Steam API key and SteamID64, then import your library.');
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => saveSteamSettings(settings), [settings]);
  async function importLibrary() {
    if (!settings.apiKey.trim() || !settings.steamId64.trim()) { setStatus('Steam API key and SteamID64 are required for automatic library import.'); return; }
    setIsLoading(true);
    try {
      const [ownedGames, recentlyPlayedGames, profile] = await Promise.all([getOwnedGames(settings), getRecentlyPlayedGames(settings), getSteamPlayerSummary(settings).catch(() => null)]);
      const existing = new Set(games.map((game) => game.steamAppId).filter((id): id is number => typeof id === 'number'));
      const mapped = mapSteamGamesToLocalGames(ownedGames.filter((game) => !existing.has(game.appid)), recentlyPlayedGames);
      onImportGames(mapped); if (mapped.length > 0) onSteamLibraryImported?.(); if (profile) onSteamProfileNameChange?.(profile.personaName || profile.profileName || '');
      setStatus(`Imported ${mapped.length} Steam games.`); onComplete();
    } catch (error) { setStatus(error instanceof SteamApiError ? error.message : 'Steam import failed. Check credentials and profile privacy.'); }
    finally { setIsLoading(false); }
  }
  return <div><h3 className="text-2xl font-semibold text-white">Steam Account</h3><div className="mt-4 grid gap-3 lg:grid-cols-3"><Input label="Steam Web API key" value={settings.apiKey} onChange={(v) => setSettings({ ...settings, apiKey: v })} type="password" /><Input label="SteamID64" value={settings.steamId64} onChange={(v) => setSettings({ ...settings, steamId64: v })} /><Input label="Steam profile URL or vanity" value={settings.wishlistUrl} onChange={(v) => setSettings({ ...settings, wishlistUrl: v })} /></div><Status text={status} /><Actions primary="Import Steam Library" onPrimary={importLibrary} onSkip={onSkip} loading={isLoading} /></div>;
}

function PlatformsStep({ activePlatforms, onComplete, onPlatformQueueStateChange, onSkip, queueState }: { activePlatforms: GamePlatform[]; onComplete: () => void; onPlatformQueueStateChange: (state: PlatformQueueState) => void; onSkip: () => void; queueState: PlatformQueueState }) {
  const [selected, setSelected] = useState<Set<GamePlatform>>(() => new Set(activePlatforms));
  function save() { let next = { ...queueState, activePlatforms: [] as GamePlatform[] }; selected.forEach((platform) => { next = addActiveQueuePlatform(next, platform); }); onPlatformQueueStateChange(next); onComplete(); }
  return <div><h3 className="text-2xl font-semibold text-white">Active Platforms</h3><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Array.from(new Set([...preferredPlatformOptions, ...gamePlatforms])).map((platform) => <label key={platform} className="flex items-center gap-2 rounded-md border border-white/10 bg-ink-900 p-3 text-sm text-white"><input checked={selected.has(platform)} onChange={(e) => setSelected((cur) => { const next = new Set(cur); e.target.checked ? next.add(platform) : next.delete(platform); return next; })} type="checkbox" />{platform}</label>)}</div><Actions primary="Save & Continue" onPrimary={save} onSkip={onSkip} disabled={selected.size === 0} /></div>;
}

function RetroStep({ games, onComplete, onImportGames, onSkip }: { games: Game[]; onComplete: () => void; onImportGames: (games: Game[]) => void; onSkip: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null); const [platform, setPlatform] = useState<RetroPlatformOverride>(autoDetectPlatformOption); const [status, setStatus] = useState('Choose a ROM folder or files to import.'); const runtime = getRuntimeEnvironment();
  useEffect(() => { inputRef.current?.setAttribute('webkitdirectory', ''); inputRef.current?.setAttribute('directory', ''); }, []);
  function scan(files: ScannableRomFile[]) { const result = scanRomFiles(files, games, platform); const existingIds = new Set(games.map((game) => game.id)); const imported = result.detectedRoms.filter((rom) => !rom.isDuplicate).map((rom) => mapDetectedRomToGame(rom, existingIds)); onImportGames(imported); setStatus(`Imported ${imported.length} retro games from ${result.summary.scannedFiles} scanned files.`); if (imported.length > 0) onComplete(); }
  async function pickAndroid() { try { const result = await RetroFolderPicker.pickFolder(); scan(result.files.map((file) => ({ name: file.name, path: file.path, uri: file.uri }))); } catch { setStatus('Folder selection was cancelled or unavailable.'); } }
  return <div><h3 className="text-2xl font-semibold text-white">Retro ROM Locations</h3><label className="mt-4 block"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Platform assignment</span><select className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white" value={platform} onChange={(e) => setPlatform(e.target.value as RetroPlatformOverride)}>{[autoDetectPlatformOption, ...retroImportPlatforms].map((option) => <option key={option} value={option}>{option}</option>)}</select></label><input ref={inputRef} className="hidden" multiple onChange={(e) => scan(Array.from(e.target.files ?? []))} type="file" /><div className="mt-4 flex flex-wrap gap-2"><button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950" onClick={() => runtime.isAndroid ? pickAndroid() : inputRef.current?.click()} type="button">Pick ROM Folder</button><button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={onSkip} type="button">Skip</button></div><Status text={status} /></div>;
}

function VisualStep({ accentColorPreference, onAccentColorChange, onComplete, onThemePreferenceChange, themePreference }: { accentColorPreference: AccentColorPreference; onAccentColorChange: (color: AccentColorPreference) => void; onComplete: () => void; onThemePreferenceChange: (preference: ThemePreference) => void; themePreference: ThemePreference }) {
  return <div><h3 className="text-2xl font-semibold text-white">Visual Preferences</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Theme</span><select className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white" value={themePreference} onChange={(e) => onThemePreferenceChange(e.target.value as ThemePreference)}><option value="system">Follow device</option><option value="dark">Dark</option><option value="light">Light</option></select></label><Input label="Accent color" value={accentColorPreference ?? '#5bffd8'} onChange={(v) => onAccentColorChange(v)} type="color" /></div><Actions primary="Save & Continue" onPrimary={onComplete} /></div>;
}

function QueueStep({ games, onComplete, onImportGames, onPlatformQueueStateChange, onSkip, queueState }: { games: Game[]; onComplete: () => void; onImportGames: (games: Game[]) => void; onPlatformQueueStateChange: (state: PlatformQueueState) => void; onSkip: () => void; queueState: PlatformQueueState }) {
  const libraryGames = games.filter((game) => game.collectionType === 'library'); const [gameId, setGameId] = useState(libraryGames[0]?.id ?? ''); const [title, setTitle] = useState(''); const [platform, setPlatform] = useState<GamePlatform>(getActiveQueuePlatforms(queueState)[0] ?? 'Steam');
  function save() { const game = libraryGames.find((item) => item.id === gameId) ?? (title.trim() ? { id: `manual-${Date.now()}`, title: title.trim(), platform, status: 'Want to play' as const, coverImage: '', playtimeHours: 0, tags: [], lastPlayedAt: null, notes: '', collectionType: 'library' as const, externalSource: 'manual' as const, importedAt: new Date().toISOString() } : null); if (!game) return; if (!games.some((item) => item.id === game.id)) { onImportGames([game]); } onPlatformQueueStateChange(addGameToPlatformQueue(addActiveQueuePlatform(queueState, platform), game, platform)); onComplete(); }
  return <div><h3 className="text-2xl font-semibold text-white">Queue Setup</h3>{libraryGames.length > 0 ? <label className="mt-4 block"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pick a library game</span><select className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white" value={gameId} onChange={(e) => setGameId(e.target.value)}>{libraryGames.map((game) => <option key={game.id} value={game.id}>{game.title}</option>)}</select></label> : <Input label="Add first game manually" value={title} onChange={setTitle} />}<label className="mt-3 block"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Queue platform</span><select className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white" value={platform} onChange={(e) => setPlatform(e.target.value as GamePlatform)}>{Array.from(new Set([...getActiveQueuePlatforms(queueState), ...preferredPlatformOptions])).map((p) => <option key={p} value={p}>{p}</option>)}</select></label><Actions primary="Continue" onPrimary={save} onSkip={onSkip} disabled={!gameId && !title.trim()} /></div>;
}

function FinishStep({ activePlatforms, onComplete, onOpenLibrary, onOpenQueue, queueCount, retroFolderCount, steamImported }: { activePlatforms: number; onComplete: () => void; onOpenLibrary: () => void; onOpenQueue: () => void; queueCount: number; retroFolderCount: number; steamImported: boolean }) { return <div><h3 className="text-2xl font-semibold text-white">Setup complete</h3><dl className="mt-4 grid gap-2 text-sm text-slate-300"><div>Steam imported: {steamImported ? 'Yes' : 'No'}</div><div>Platforms configured: {activePlatforms}</div><div>Retro games imported: {retroFolderCount}</div><div>Queue games: {queueCount}</div></dl><div className="mt-5 flex flex-wrap gap-2"><button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950" onClick={() => { onComplete(); onOpenLibrary(); }} type="button">Open Library</button><button className="h-11 rounded-md border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint" onClick={() => { onComplete(); onOpenQueue(); }} type="button">Open Queue</button></div></div>; }
function Input({ label, onChange, type = 'text', value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) { return <label className="block"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span><input className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" onChange={(e) => onChange(e.target.value)} type={type} value={value} /></label>; }
function Status({ text }: { text: string }) { return <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2 text-sm text-slate-300">{text}</div>; }
function Actions({ disabled = false, loading = false, onPrimary, onSkip, primary }: { disabled?: boolean; loading?: boolean; onPrimary: () => void; onSkip?: () => void; primary: string }) { return <div className="mt-5 flex flex-wrap gap-2"><button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 disabled:bg-slate-600" disabled={disabled || loading} onClick={onPrimary} type="button">{loading ? 'Working...' : primary}</button>{onSkip ? <button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={onSkip} type="button">Skip</button> : null}</div>; }
