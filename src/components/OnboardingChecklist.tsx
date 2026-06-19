import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { ViewportModal } from './ViewportModal';
import { loadSteamSettings, saveSteamSettings } from '../lib/steamSettingsStorage';
import { getOwnedGames, getRecentlyPlayedGames, getSteamPlayerSummary, mapSteamGamesToLocalGames, SteamApiError } from '../services/steamApi';
import { autoDetectPlatformOption, mapDetectedRomToGame, retroImportPlatforms, scanRomFiles, type RetroPlatformOverride, type ScannableRomFile } from '../lib/retroRomImport';
import { getRuntimeEnvironment } from '../lib/capacitorEnvironment';
import { RetroFolderPicker } from '../lib/retroFolderPicker';
import { loadRawgSettings, saveRawgSettings } from '../lib/rawgSettingsStorage';
import { createQuestShelfBackup } from '../lib/backupStorage';
import { exportQuestShelfBackupFile } from '../lib/backupExport';
import { maxLibraryOwnerNicknameLength } from '../lib/appPersonalization';
import { ShelfAvatar, ShelfIdentityEditor } from './ShelfIdentity';
import { getComputedShelfTitle, type ShelfIdentitySettings } from '../lib/shelfIdentity';
import { onboardingItemIds, type OnboardingItemId } from '../lib/onboardingStorage';
import { loadAnalyticsSettings, updateAnalyticsEnabled } from '../lib/analytics';
import { defaultAccentColor, normalizeAccentColor, type AccentColorPreference, type AppTemplatePreference } from '../lib/themePreferences';
import type { Game } from '../types/game';
import type { SteamSettings } from '../types/steam';
import type { RawgSettings } from '../types/rawg';

type OnboardingChecklistProps = {
  completedItemIds: Set<OnboardingItemId>;
  games: Game[];
  onAction?: (itemId: OnboardingItemId, action?: 'primary' | 'secondary') => void;
  onClose?: () => void;
  onComplete: (itemId: OnboardingItemId) => void;
  onImportGames: (games: Game[]) => void;
  onOpenLibrary: () => void;
  onOpenQueue: () => void;
  onSkip: (itemId: OnboardingItemId) => void;
  onSteamLibraryImported?: () => void;
  onSteamProfileNameChange?: (profileName: string) => void;
  libraryOwnerNickname: string;
  personalizedQuestShelfTitle: string;
  shelfIdentity: ShelfIdentitySettings;
  steamAvatarUrl: string;
  steamPersonaName: string;
  appTemplatePreference: AppTemplatePreference;
  accentColorPreference: AccentColorPreference;
  onLibraryOwnerNicknameChange: (nickname: string) => void;
  onShelfIdentityChange: (identity: ShelfIdentitySettings) => void;
  onAppTemplatePreferenceChange: (preference: AppTemplatePreference) => void;
  onAccentColorChange: (color: AccentColorPreference) => void;
  skippedItemIds: Set<OnboardingItemId>;
};

type WizardStep = {
  id: (typeof onboardingItemIds)[number];
  title: string;
  summary: string;
  isConfigured: () => boolean;
};

export function OnboardingChecklist({
  completedItemIds,
  games,
  onAction,
  onClose,
  onComplete,
  onImportGames,
  onOpenLibrary,
  onOpenQueue,
  onSkip,
  onSteamLibraryImported,
  onSteamProfileNameChange,
  libraryOwnerNickname,
  personalizedQuestShelfTitle,
  shelfIdentity,
  steamAvatarUrl,
  steamPersonaName,
  appTemplatePreference,
  accentColorPreference,
  onLibraryOwnerNicknameChange,
  onShelfIdentityChange,
  onAppTemplatePreferenceChange,
  onAccentColorChange,
  skippedItemIds,
}: OnboardingChecklistProps) {
  const { t } = useI18n();
  const steamImported = games.some((game) => game.collectionType === 'library' && game.externalSource === 'steam');
  const retroFolderCount = games.filter((game) => game.collectionType === 'library' && game.externalSource === 'retro-rom').length;
  const rawgEnriched = games.some((game) => game.metadataSource === 'rawg');
  const [analyticsSettings] = useState(() => loadAnalyticsSettings());
  const steps = useMemo<WizardStep[]>(() => [
    { id: 'steam-connect', title: t('onboarding.stepSteamTitle'), summary: t('onboarding.stepSteamSummary'), isConfigured: () => steamImported || Boolean(loadSteamSettings().steamId64.trim() && loadSteamSettings().apiKey.trim()) },
    { id: 'rawg-api-key', title: t('onboarding.stepRawgTitle'), summary: t('onboarding.stepRawgSummary'), isConfigured: () => Boolean(loadRawgSettings().apiKey.trim()) || rawgEnriched },
    { id: 'retro-import', title: t('onboarding.stepRetroTitle'), summary: t('onboarding.stepRetroSummary'), isConfigured: () => retroFolderCount > 0 },
    { id: 'backup-exported', title: t('onboarding.stepBackupTitle'), summary: t('onboarding.stepBackupSummary'), isConfigured: () => completedItemIds.has('backup-exported') },
    { id: 'make-it-yours', title: t('onboarding.stepPersonalizeTitle'), summary: t('onboarding.stepPersonalizeSummary'), isConfigured: () => completedItemIds.has('make-it-yours') },
    { id: 'ready', title: t('onboarding.stepFinishTitle'), summary: t('onboarding.stepFinishSummary'), isConfigured: () => completedItemIds.has('ready') },
    ...(analyticsSettings.hasSeenAnalyticsNotice ? [] : [{ id: 'analytics-notice' as const, title: t('onboarding.stepAnalyticsTitle'), summary: t('onboarding.stepAnalyticsSummary'), isConfigured: () => loadAnalyticsSettings().hasSeenAnalyticsNotice }]),
  ], [analyticsSettings.hasSeenAnalyticsNotice, completedItemIds, rawgEnriched, retroFolderCount, steamImported, t]);

  useEffect(() => {
    steps.forEach((step) => {
      if (step.id !== 'backup-exported' && step.id !== 'make-it-yours' && step.id !== 'ready' && step.id !== 'analytics-notice' && step.isConfigured() && !completedItemIds.has(step.id)) {
        onComplete(step.id);
      }
    });
  }, [completedItemIds, onComplete, steps]);

  const firstUnfinishedStepIndex = steps.findIndex((step) => !completedItemIds.has(step.id) && !skippedItemIds.has(step.id));
  const initialStepIndex = firstUnfinishedStepIndex === -1 ? steps.length - 1 : firstUnfinishedStepIndex;
  const [activeStepIndex, setActiveStepIndex] = useState(initialStepIndex);
  const activeStep = steps[activeStepIndex];
  const finishedCount = steps.filter((step) => completedItemIds.has(step.id) || skippedItemIds.has(step.id)).length;
  const progressPercent = Math.round((finishedCount / steps.length) * 100);
  const stepComplete = completedItemIds.has(activeStep.id);
  const stepSkipped = skippedItemIds.has(activeStep.id);

  function goNext() { setActiveStepIndex((index) => Math.min(index + 1, steps.length - 1)); }
  function goBack() { setActiveStepIndex((index) => Math.max(index - 1, 0)); }
  function skipStep() {
    if (activeStep.id === 'analytics-notice') {
      updateAnalyticsEnabled(false);
      onComplete('analytics-notice');
      return;
    }
    onSkip(activeStep.id);
    goNext();
  }
  function openRelatedSettings(itemId: OnboardingItemId) { onClose?.(); onAction?.(itemId); }

  const libraryGameCount = games.filter((game) => game.collectionType === 'library').length;
  const libraryPlatformCount = new Set(games.filter((game) => game.collectionType === 'library').map((game) => game.platform)).size;

  return (
    <ViewportModal ariaLabel={t('onboarding.assistant')} placement="fullscreen" onClose={onClose ?? (() => undefined)}>
      <div className="qs-setup-modal">

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">{t('onboarding.assistant')}</div>
            <h2 className="mt-0.5 text-2xl font-semibold text-white">{t('onboarding.setupTitle')}</h2>
            <p className="mt-1.5 max-w-xl text-sm text-slate-400">{t('onboarding.wizardSubtitle')}</p>
          </div>
          <button
            className="mt-1 shrink-0 h-10 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200 hover:bg-mint/10"
            onClick={onClose}
            type="button"
          >
            {t('action.close')}
          </button>
        </div>

        <div className="mt-5 rounded-md border border-skyglass/15 bg-ink-900/50 p-3">
          <div className="flex justify-between text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            <span>{activeStep.title}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-mint transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <ol className="qs-setup-steps mt-5 grid gap-2 sm:grid-cols-7">
          {steps.map((step, index) => {
            const isDone = completedItemIds.has(step.id);
            const isSkipped = skippedItemIds.has(step.id);
            return (
              <li key={step.id}>
                <button
                  className={`qs-setup-step ${index === activeStepIndex ? 'is-active' : ''} ${isDone ? 'is-complete' : ''}`}
                  onClick={() => setActiveStepIndex(index)}
                  type="button"
                >
                  <span>{isDone ? '✓' : isSkipped ? '–' : index + 1}</span>
                  <strong>{step.title}</strong>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 flex-1 rounded-lg border border-mint/20 bg-ink-900/40 p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold text-white">{activeStep.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{activeStep.summary}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${stepComplete ? 'border-mint/40 bg-mint/10 text-mint' : stepSkipped ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-skyglass/15 text-slate-300'}`}>
              {stepComplete ? t('onboarding.completed') : stepSkipped ? t('onboarding.skipped') : t('onboarding.openStatus')}
            </span>
          </div>
          <div key={activeStepIndex} className="qs-setup-step-body">
            {activeStep.id === 'steam-connect' ? <SteamStep games={games} onComplete={() => onComplete('steam-connect')} onImportGames={onImportGames} onSkip={skipStep} onSteamLibraryImported={onSteamLibraryImported} onSteamProfileNameChange={onSteamProfileNameChange} /> : null}
            {activeStep.id === 'rawg-api-key' ? <RawgStep onComplete={() => onComplete('rawg-api-key')} onOpenSettings={() => openRelatedSettings('rawg-api-key')} /> : null}
            {activeStep.id === 'retro-import' ? <RetroStep games={games} onComplete={() => onComplete('retro-import')} onImportGames={onImportGames} onSkip={skipStep} /> : null}
            {activeStep.id === 'backup-exported' ? <BackupStep onComplete={() => onComplete('backup-exported')} onOpenSettings={() => openRelatedSettings('backup-exported')} /> : null}
            {activeStep.id === 'make-it-yours' ? <PersonalizeStep accentColorPreference={accentColorPreference} appTemplatePreference={appTemplatePreference} games={games} gameCount={libraryGameCount} libraryOwnerNickname={libraryOwnerNickname} onAccentColorChange={onAccentColorChange} onAppTemplatePreferenceChange={onAppTemplatePreferenceChange} onComplete={() => { onComplete('make-it-yours'); goNext(); }} onSkip={skipStep} onLibraryOwnerNicknameChange={onLibraryOwnerNicknameChange} onShelfIdentityChange={onShelfIdentityChange} personalizedQuestShelfTitle={personalizedQuestShelfTitle} shelfIdentity={shelfIdentity} steamAvatarUrl={steamAvatarUrl} steamPersonaName={steamPersonaName} platformCount={libraryPlatformCount} /> : null}
            {activeStep.id === 'ready' ? <FinishStep shelfTitle={getComputedShelfTitle(games)} gameCount={libraryGameCount} onComplete={() => onComplete('ready')} onOpenLibrary={onOpenLibrary} onOpenQueue={onOpenQueue} personalizedQuestShelfTitle={personalizedQuestShelfTitle} platformCount={libraryPlatformCount} progress={`${finishedCount}/${steps.length}`} /> : null}
            {activeStep.id === 'analytics-notice' ? <AnalyticsStep onChoose={(isEnabled) => { updateAnalyticsEnabled(isEnabled); onComplete('analytics-notice'); }} /> : null}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            className="h-11 rounded-md border border-skyglass/15 px-4 text-sm font-semibold text-slate-200 disabled:opacity-40"
            disabled={activeStepIndex === 0}
            onClick={goBack}
            type="button"
          >
            {t('action.back')}
          </button>
          <div className="flex gap-2">
            <button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-300" onClick={skipStep} type="button">
              {t('onboarding.skipStep')}
            </button>
            <button className="h-11 rounded-md bg-mint px-5 text-sm font-semibold text-ink-950" onClick={goNext} type="button">
              {activeStepIndex === steps.length - 1 ? t('onboarding.stayHere') : t('onboarding.next')}
            </button>
          </div>
        </div>

      </div>
    </ViewportModal>
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
      onImportGames(mapped); if (profile) setSettings({ ...settings, profile: { ...profile, updatedAt: new Date().toISOString() } }); if (mapped.length > 0) onSteamLibraryImported?.(); if (profile) onSteamProfileNameChange?.(profile.personaName || profile.profileName || '');
      setStatus(`Imported ${mapped.length} Steam games.`); onComplete();
    } catch (error) { setStatus(error instanceof SteamApiError ? error.message : 'Steam import failed. Check credentials and profile privacy.'); }
    finally { setIsLoading(false); }
  }
  return <div><div className="grid gap-3 lg:grid-cols-3"><Input label="Steam Web API key" value={settings.apiKey} onChange={(v) => setSettings({ ...settings, apiKey: v })} type="password" /><Input label="SteamID64" value={settings.steamId64} onChange={(v) => setSettings({ ...settings, steamId64: v })} /><Input label="Steam profile URL or vanity" value={settings.wishlistUrl} onChange={(v) => setSettings({ ...settings, wishlistUrl: v })} /></div><Status text={status} /><Actions primary="Import Steam Library" onPrimary={importLibrary} onSkip={onSkip} loading={isLoading} /></div>;
}

function RawgStep({ onComplete, onOpenSettings }: { onComplete: () => void; onOpenSettings: () => void }) {
  const [settings, setSettings] = useState<RawgSettings>(() => loadRawgSettings());
  const [status, setStatus] = useState('Paste a RAWG key to enable metadata enrichment.');
  useEffect(() => saveRawgSettings(settings), [settings]);
  return <div><Input label="RAWG API key" value={settings.apiKey} onChange={(apiKey) => { setSettings({ apiKey }); if (apiKey.trim()) { setStatus('RAWG key saved.'); onComplete(); } }} type="password" /><Status text={status} /><Actions primary="Open enrichment settings" onPrimary={onOpenSettings} /></div>;
}

function RetroStep({ games, onComplete, onImportGames, onSkip }: { games: Game[]; onComplete: () => void; onImportGames: (games: Game[]) => void; onSkip: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null); const [platform, setPlatform] = useState<RetroPlatformOverride>(autoDetectPlatformOption); const [status, setStatus] = useState('Choose a ROM folder or files to import.'); const runtime = getRuntimeEnvironment();
  useEffect(() => { inputRef.current?.setAttribute('webkitdirectory', ''); inputRef.current?.setAttribute('directory', ''); }, []);
  function scan(files: ScannableRomFile[]) { const result = scanRomFiles(files, games, platform); const existingIds = new Set(games.map((game) => game.id)); const imported = result.detectedRoms.filter((rom) => !rom.isDuplicate).map((rom) => mapDetectedRomToGame(rom, existingIds)); onImportGames(imported); setStatus(`Imported ${imported.length} retro games from ${result.summary.scannedFiles} scanned files.`); if (imported.length > 0) onComplete(); }
  async function pickAndroid() { try { const result = await RetroFolderPicker.pickFolder(); scan(result.files.map((file) => ({ name: file.name, path: file.path, uri: file.uri }))); } catch { setStatus('Folder selection was cancelled or unavailable.'); } }
  return <div><label className="block"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Platform assignment</span><select className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white" value={platform} onChange={(e) => setPlatform(e.target.value as RetroPlatformOverride)}>{[autoDetectPlatformOption, ...retroImportPlatforms].map((option) => <option key={option} value={option}>{option}</option>)}</select></label><input ref={inputRef} className="hidden" multiple onChange={(e) => scan(Array.from(e.target.files ?? []))} type="file" /><div className="mt-4 flex flex-wrap gap-2"><button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950" onClick={() => runtime.isAndroid ? pickAndroid() : inputRef.current?.click()} type="button">Pick ROM Folder</button><button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={onSkip} type="button">Skip</button></div><Status text={status} /></div>;
}

function BackupStep({ onComplete, onOpenSettings }: { onComplete: () => void; onOpenSettings: () => void }) {
  const [status, setStatus] = useState('Export a portable JSON backup. Integration keys are excluded from this quick export.');
  async function exportBackup() { const result = await exportQuestShelfBackupFile(createQuestShelfBackup(false)); setStatus(`Backup exported as ${result.fileName}.`); onComplete(); }
  return <div><Status text={status} /><Actions primary="Export backup" onPrimary={() => { void exportBackup(); }} /><button className="mt-3 h-10 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={onOpenSettings} type="button">Open backup settings</button></div>;
}


function PersonalizeStep({ accentColorPreference, appTemplatePreference, gameCount, games, libraryOwnerNickname, onAccentColorChange, onAppTemplatePreferenceChange, onComplete, onSkip, onLibraryOwnerNicknameChange, onShelfIdentityChange, personalizedQuestShelfTitle, platformCount, shelfIdentity, steamAvatarUrl, steamPersonaName }: { accentColorPreference: AccentColorPreference; appTemplatePreference: AppTemplatePreference; gameCount: number; games: Game[]; libraryOwnerNickname: string; onAccentColorChange: (color: AccentColorPreference) => void; onAppTemplatePreferenceChange: (preference: AppTemplatePreference) => void; onComplete: () => void; onSkip: () => void; onLibraryOwnerNicknameChange: (nickname: string) => void; onShelfIdentityChange: (identity: ShelfIdentitySettings) => void; personalizedQuestShelfTitle: string; platformCount: number; shelfIdentity: ShelfIdentitySettings; steamAvatarUrl: string; steamPersonaName: string }) {
  const selectedAccentColor = accentColorPreference ?? defaultAccentColor;
  const accentPresets = [defaultAccentColor, '#1b75d0', '#8b5cf6', '#14b8a6', '#f59e0b'];
  const shelfExamples = [steamPersonaName, 'Loopak', 'Lukáš'].filter(Boolean);
  const previewTitle = personalizedQuestShelfTitle;
  const chooseAccent = (color: string) => { const normalizedColor = normalizeAccentColor(color); if (normalizedColor) onAccentColorChange(normalizedColor === defaultAccentColor ? null : normalizedColor); };

  return <div className="space-y-5"><div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><div className="space-y-4"><ShelfIdentityEditor identity={shelfIdentity} onIdentityChange={onShelfIdentityChange} shelfNamePlaceholder={steamPersonaName || 'Loopak'} steamAvatarUrl={steamAvatarUrl} steamPersonaName={steamPersonaName} /><label className="block"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Name / Nickname</span><input className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" maxLength={maxLibraryOwnerNicknameLength} onChange={(event) => onLibraryOwnerNicknameChange(event.target.value)} placeholder="Loopak" value={libraryOwnerNickname} /></label><div className="flex flex-wrap gap-2">{shelfExamples.map((example) => <button className="rounded-full border border-skyglass/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-mint/40 hover:bg-mint/10" key={example} onClick={() => onShelfIdentityChange({ ...shelfIdentity, shelfName: example })} type="button">{example}</button>)}</div><div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Theme selection</div><div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Theme selection"><button aria-pressed={appTemplatePreference === 'classic'} className={`rounded-lg border p-3 text-left ${appTemplatePreference === 'classic' ? 'border-mint/60 bg-mint/10 text-mint' : 'border-skyglass/15 text-slate-200'}`} onClick={() => onAppTemplatePreferenceChange('classic')} type="button"><strong>Default</strong><span className="mt-1 block text-xs text-slate-400">Clean dark QuestShelf identity.</span></button><button aria-pressed={appTemplatePreference === 'neon-deck'} className={`rounded-lg border p-3 text-left ${appTemplatePreference === 'neon-deck' ? 'border-mint/60 bg-mint/10 text-mint' : 'border-skyglass/15 text-slate-200'}`} onClick={() => onAppTemplatePreferenceChange('neon-deck')} type="button"><strong>Neon</strong><span className="mt-1 block text-xs text-slate-400">Arcade glow and deck-style panels.</span></button></div></div><div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Accent color</div><div className="mt-2 flex flex-wrap items-center gap-2"><input className="h-11 w-16 rounded-md border border-white/10 bg-ink-900 p-1" onChange={(event) => chooseAccent(event.target.value)} type="color" value={selectedAccentColor} />{accentPresets.map((color) => <button aria-label={`Use ${color} accent`} aria-pressed={selectedAccentColor === color} className={`h-11 w-11 rounded-md border ${selectedAccentColor === color ? 'border-white shadow-glow' : 'border-white/10'}`} key={color} onClick={() => chooseAccent(color)} style={{ backgroundColor: color }} type="button" />)}</div></div></div><div className="rounded-2xl border border-mint/25 bg-ink-950/80 p-4 shadow-glow"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Live preview</div><div className="mt-3 flex items-center gap-3"><ShelfAvatar {...shelfIdentity} steamAvatarUrl={steamAvatarUrl} sizeClassName="h-14 w-14" /><h4 className="text-2xl font-semibold text-white">{previewTitle}</h4></div><p className="mt-2 text-sm text-slate-400">Welcome back — your backlog, wishlist, and queue now share this Shelf Identity.</p><div className="mt-5 grid gap-2 text-sm"><span className="rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2">{gameCount} games imported</span><span className="rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2">{platformCount} platforms configured</span><span className="rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-mint">Avatar persists after restart</span></div></div></div><div className="flex flex-wrap gap-2"><button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950" onClick={onComplete} type="button">Save personalization</button><button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={onSkip} type="button">Skip for now</button></div></div>;
}


function AnalyticsStep({ onChoose }: { onChoose: (isEnabled: boolean) => void }) {
  const { t } = useI18n();
  const checklistItems = [
    t('onboarding.analyticsNoGameTitles'),
    t('onboarding.analyticsNoNotes'),
    t('onboarding.analyticsNoTags'),
    t('onboarding.analyticsNoAccountInfo'),
    t('onboarding.analyticsNoPersonalData'),
  ];

  return (
    <div className="rounded-2xl border border-mint/25 bg-ink-950/70 p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Community Alpha</div>
      <h3 className="mt-2 text-3xl font-semibold text-white">{t('onboarding.analyticsTitle')}</h3>
      <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-slate-300">{t('onboarding.analyticsBody')}</p>
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {checklistItems.map((item) => (
          <li className="rounded-lg border border-skyglass/15 bg-ink-900 px-3 py-2 text-sm font-medium text-slate-200" key={item}>✓ {item}</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950" onClick={() => onChoose(true)} type="button">{t('onboarding.analyticsEnable')}</button>
        <button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={() => onChoose(false)} type="button">{t('onboarding.analyticsNotNow')}</button>
      </div>
    </div>
  );
}

function FinishStep({ gameCount, onComplete, onOpenLibrary, onOpenQueue, personalizedQuestShelfTitle, platformCount, progress, shelfTitle }: { gameCount: number; onComplete: () => void; onOpenLibrary: () => void; onOpenQueue: () => void; personalizedQuestShelfTitle: string; platformCount: number; progress: string; shelfTitle: string }) { return <div className="rounded-2xl border border-mint/30 bg-mint/10 p-5 text-center shadow-glow"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint text-2xl text-ink-950">✓</div><h3 className="mt-4 text-3xl font-semibold text-white">Your QuestShelf is ready.</h3><p className="mt-2 text-lg text-mint">{personalizedQuestShelfTitle}</p>{shelfTitle ? <p className="mt-1 text-sm font-semibold text-white">🏆 {shelfTitle}</p> : null}<div className="mt-4 flex flex-wrap justify-center gap-2 text-sm text-slate-200"><span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1.5">{gameCount} games imported</span><span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1.5">{platformCount} platforms configured</span><span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1.5">Setup progress: {progress}</span></div><div className="mt-5 flex flex-wrap justify-center gap-2"><button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950" onClick={() => { onComplete(); onOpenLibrary(); }} type="button">Start exploring</button><button className="h-11 rounded-md border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint" onClick={() => { onComplete(); onOpenLibrary(); }} type="button">Open Library</button></div></div>; }
function Input({ label, onChange, type = 'text', value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) { return <label className="block"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span><input className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" onChange={(e) => onChange(e.target.value)} type={type} value={value} /></label>; }
function Status({ text }: { text: string }) { return <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2 text-sm text-slate-300">{text}</div>; }
function Actions({ disabled = false, loading = false, onPrimary, onSkip, primary }: { disabled?: boolean; loading?: boolean; onPrimary: () => void; onSkip?: () => void; primary: string }) { return <div className="mt-5 flex flex-wrap gap-2"><button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 disabled:bg-slate-600" disabled={disabled || loading} onClick={onPrimary} type="button">{loading ? 'Working...' : primary}</button>{onSkip ? <button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={onSkip} type="button">Skip</button> : null}</div>; }
