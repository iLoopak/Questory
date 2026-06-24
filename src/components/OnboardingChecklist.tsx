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
  onImportGames: (games: Game[]) => Game[];
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
  const [analyticsSettings, setAnalyticsSettings] = useState(() => loadAnalyticsSettings());
  const steps = useMemo<WizardStep[]>(() => [
    { id: 'steam-connect', title: t('onboarding.stepSteamTitle'), summary: t('onboarding.stepSteamSummary'), isConfigured: () => steamImported || Boolean(loadSteamSettings().steamId64.trim() && loadSteamSettings().apiKey.trim()) },
    { id: 'make-it-yours', title: t('onboarding.stepPersonalizeTitle'), summary: t('onboarding.stepPersonalizeSummary'), isConfigured: () => completedItemIds.has('make-it-yours') },
    { id: 'how-it-works', title: t('onboarding.stepHowItWorksTitle'), summary: t('onboarding.stepHowItWorksSummary'), isConfigured: () => completedItemIds.has('how-it-works') },
    { id: 'ready', title: t('onboarding.stepFinishTitle'), summary: t('onboarding.stepFinishSummary'), isConfigured: () => completedItemIds.has('ready') },
  ], [completedItemIds, steamImported, t]);

  const firstUnfinishedStepIndex = steps.findIndex((step) => !completedItemIds.has(step.id) && !skippedItemIds.has(step.id));
  const initialStepIndex = firstUnfinishedStepIndex === -1 ? steps.length - 1 : firstUnfinishedStepIndex;
  const [activeStepIndex, setActiveStepIndex] = useState(initialStepIndex);
  const activeStep = steps[activeStepIndex];
  const finishedCount = steps.filter((step) => completedItemIds.has(step.id) || skippedItemIds.has(step.id)).length;
  const progressPercent = Math.round((finishedCount / steps.length) * 100);
  const stepComplete = completedItemIds.has(activeStep.id);
  const stepSkipped = skippedItemIds.has(activeStep.id);
  const nextRequiresCurrentStep = activeStep.id === 'steam-connect' && !stepComplete && !stepSkipped;
  const nextButtonClassName = stepComplete
    ? 'h-11 rounded-md bg-mint px-5 text-sm font-semibold text-ink-950 shadow-glow ring-2 ring-mint/40'
    : 'h-11 rounded-md bg-mint px-5 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300';

  function goNext() { setActiveStepIndex((index) => Math.min(index + 1, steps.length - 1)); }
  function goToNextIncompleteStep(handledStepId: OnboardingItemId) {
    const handledItemIds = new Set([...completedItemIds, ...skippedItemIds, handledStepId]);
    const nextIncompleteStepIndex = steps.findIndex((step, index) => index > activeStepIndex && !handledItemIds.has(step.id));
    if (nextIncompleteStepIndex !== -1) setActiveStepIndex(nextIncompleteStepIndex);
  }
  function goBack() { setActiveStepIndex((index) => Math.max(index - 1, 0)); }
  function skipStep() {
    onSkip(activeStep.id);
    goNext();
  }
  function openRelatedSettings(itemId: OnboardingItemId) { onClose?.(); onAction?.(itemId); }

  const libraryGameCount = games.filter((game) => game.collectionType === 'library').length;
  const libraryPlatformCount = new Set(games.filter((game) => game.collectionType === 'library').map((game) => game.platform)).size;

  return (
    <ViewportModal ariaLabel={t('onboarding.assistant')} placement="fullscreen" onClose={onClose ?? (() => undefined)}>
      <div className="qs-setup-modal">

        <div className="qs-setup-header flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-spread text-mint">{t('onboarding.assistant')}</div>
            <h2 className="mt-0.5 text-2xl font-semibold text-white">{t('onboarding.setupTitle')}</h2>
            <p className="mt-1.5 max-w-xl text-sm text-slate-400">{t('onboarding.wizardSubtitle')}</p>
          </div>
          <button
            className="qs-setup-close mt-1 shrink-0 h-10 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200 hover:bg-mint/10"
            onClick={onClose}
            type="button"
          >
            {t('action.close')}
          </button>
        </div>

        <div className="qs-setup-progress mt-5 rounded-md border border-skyglass/15 bg-ink-900/50 p-3">
          <div className="flex justify-between qs-label-caps text-slate-400">
            <span>{activeStep.title}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-mint transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <ol className="qs-setup-steps mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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

        <div className="qs-setup-content mt-5 flex-1 rounded-lg border border-mint/20 bg-ink-900/40 p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold text-white">{activeStep.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{activeStep.summary}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 qs-label-caps ${stepComplete ? 'border-mint/40 bg-mint/10 text-mint' : stepSkipped ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-skyglass/15 text-slate-300'}`}>
              {stepComplete ? t('onboarding.completed') : stepSkipped ? t('onboarding.skipped') : t('onboarding.openStatus')}
            </span>
          </div>
          <div key={activeStepIndex} className="qs-setup-step-body">
            {activeStep.id === 'steam-connect' ? <SteamStep games={games} isComplete={stepComplete} onComplete={() => onComplete('steam-connect')} onContinue={goNext} onImportGames={onImportGames} onSkip={skipStep} onSteamLibraryImported={onSteamLibraryImported} onSteamProfileNameChange={onSteamProfileNameChange} /> : null}
            {activeStep.id === 'make-it-yours' ? <PersonalizeStep accentColorPreference={accentColorPreference} appTemplatePreference={appTemplatePreference} games={games} gameCount={libraryGameCount} libraryOwnerNickname={libraryOwnerNickname} onAccentColorChange={onAccentColorChange} onAppTemplatePreferenceChange={onAppTemplatePreferenceChange} onComplete={() => { onComplete('make-it-yours'); goNext(); }} onSkip={skipStep} onLibraryOwnerNicknameChange={onLibraryOwnerNicknameChange} onShelfIdentityChange={onShelfIdentityChange} personalizedQuestShelfTitle={personalizedQuestShelfTitle} shelfIdentity={shelfIdentity} steamAvatarUrl={steamAvatarUrl} steamPersonaName={steamPersonaName} platformCount={libraryPlatformCount} /> : null}
            {activeStep.id === 'how-it-works' ? <HowItWorksStep onComplete={() => { onComplete('how-it-works'); goNext(); }} onSkip={skipStep} /> : null}
            {activeStep.id === 'ready' ? <FinishStep analyticsSettings={analyticsSettings} shelfTitle={getComputedShelfTitle(games)} gameCount={libraryGameCount} onAnalyticsChoose={(isEnabled) => { const nextSettings = updateAnalyticsEnabled(isEnabled); setAnalyticsSettings(nextSettings); onComplete('analytics-notice'); }} onComplete={() => onComplete('ready')} onOpenLibrary={onOpenLibrary} onOpenQueue={onOpenQueue} personalizedQuestShelfTitle={personalizedQuestShelfTitle} platformCount={libraryPlatformCount} progress={`${finishedCount}/${steps.length}`} /> : null}
          </div>
        </div>

        <div className="qs-setup-footer mt-5 flex items-center justify-between gap-3">
          <button
            className="h-11 rounded-md border border-skyglass/15 px-4 text-sm font-semibold text-slate-200 disabled:opacity-40"
            disabled={activeStepIndex === 0}
            onClick={goBack}
            type="button"
          >
            {t('action.back')}
          </button>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            {activeStep.id === 'steam-connect' && stepComplete ? (
              <p className="rounded-full border border-mint/40 bg-mint/10 px-3 py-1.5 text-sm font-semibold text-mint" role="status">
                ✓ Steam setup completed. You can continue to the next step.
              </p>
            ) : null}
            <button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-300" onClick={skipStep} type="button">
              {t('onboarding.skipStep')}
            </button>
            <button className={nextButtonClassName} disabled={nextRequiresCurrentStep} onClick={goNext} type="button">
              {activeStepIndex === steps.length - 1 ? t('onboarding.stayHere') : t('onboarding.next')}
            </button>
          </div>
        </div>

      </div>
    </ViewportModal>
  );
}

type SteamImportResult = { status: 'success'; importedCount: number; skippedCount: number } | { status: 'error'; message: string };

function SteamStep({ games, isComplete, onComplete, onContinue, onImportGames, onSkip, onSteamLibraryImported, onSteamProfileNameChange }: { games: Game[]; isComplete: boolean; onComplete: () => void; onContinue: () => void; onImportGames: (games: Game[]) => Game[]; onSkip: () => void; onSteamLibraryImported?: () => void; onSteamProfileNameChange?: (profileName: string) => void }) {
  const [settings, setSettings] = useState<SteamSettings>(() => loadSteamSettings());
  const [status, setStatus] = useState('Enter your credentials below, then click Import to bring in your library.');
  const [importResult, setImportResult] = useState<SteamImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => saveSteamSettings(settings), [settings]);
  async function importLibrary() {
    if (!settings.apiKey.trim() || !settings.steamId64.trim()) {
      const message = 'Steam API key and SteamID64 are required for automatic library import.';
      setStatus(message);
      setImportResult({ status: 'error', message });
      return;
    }
    setIsLoading(true);
    setImportResult(null);
    setStatus('Importing your Steam library…');
    try {
      const [ownedGames, recentlyPlayedGames, profile] = await Promise.all([getOwnedGames(settings), getRecentlyPlayedGames(settings), getSteamPlayerSummary(settings).catch(() => null)]);
      const existing = new Set(games.map((game) => game.steamAppId).filter((id): id is number => typeof id === 'number'));
      const mapped = mapSteamGamesToLocalGames(ownedGames.filter((game) => !existing.has(game.appid)), recentlyPlayedGames);
      const createdGames = onImportGames(mapped);
      const skippedCount = Math.max(0, ownedGames.length - createdGames.length);
      if (profile) setSettings({ ...settings, profile: { ...profile, updatedAt: new Date().toISOString() } });
      onSteamLibraryImported?.();
      onComplete();
      if (profile) onSteamProfileNameChange?.(profile.personaName || profile.profileName || '');
      setImportResult({ status: 'success', importedCount: createdGames.length, skippedCount });
      setStatus('✓ Steam setup completed. You can continue to the next step.');
    } catch (error) {
      const message = error instanceof SteamApiError ? error.message : 'Steam import failed. Check credentials and profile privacy.';
      setStatus(message);
      setImportResult({ status: 'error', message });
    }
    finally { setIsLoading(false); }
  }
  return (
    <div>
      <div className="mb-5 rounded-lg border border-skyglass/15 bg-ink-950/60 p-4">
        <p className="text-sm font-semibold text-white">Import your Steam library in minutes.</p>
        <p className="mt-1 text-sm text-slate-400">QuestShelf reads your Steam profile to import games, playtime, and achievements. Your Steam account is never modified — QuestShelf is read-only.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <label className="block">
            <span className="qs-label-caps text-muted">Steam Web API key</span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint"
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              type="password"
              value={settings.apiKey}
            />
          </label>
          <p className="mt-1.5 text-xs leading-5 text-slate-400">
            Required to import your Steam library.{' '}
            <a className="text-mint underline hover:text-mint/80" href="https://steamcommunity.com/dev/apikey" rel="noreferrer" target="_blank">
              Get your free key
            </a>{' '}
            — takes about 30 seconds.
          </p>
        </div>
        <div>
          <label className="block">
            <span className="qs-label-caps text-muted">SteamID64</span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint"
              onChange={(e) => setSettings({ ...settings, steamId64: e.target.value })}
              value={settings.steamId64}
            />
          </label>
          <p className="mt-1.5 text-xs leading-5 text-slate-400">
            Your unique Steam account identifier. Find it at{' '}
            <a className="text-mint underline hover:text-mint/80" href="https://steamid.io" rel="noreferrer" target="_blank">
              steamid.io
            </a>
            .
          </p>
        </div>
        <Input label="Steam profile URL or vanity" value={settings.wishlistUrl} onChange={(v) => setSettings({ ...settings, wishlistUrl: v })} />
      </div>
      {!importResult || isLoading ? <Status text={status} /> : null}
      {importResult?.status === 'success' ? (
        <div className="mt-5 rounded-lg border border-mint/30 bg-mint/10 p-4 text-sm text-slate-100">
          <p className="text-base font-semibold text-mint">Steam import complete</p>
          <p className="mt-1 font-semibold text-mint" role="status">✓ Steam setup completed. You can continue to the next step.</p>
          <p className="mt-1">Imported {importResult.importedCount} Steam games.</p>
          {importResult.skippedCount > 0 ? <p className="mt-1 text-slate-300">Skipped {importResult.skippedCount} games that were already in your library.</p> : null}
          <button className="mt-4 h-11 rounded-md bg-mint px-5 text-sm font-semibold text-ink-950 shadow-glow ring-2 ring-mint/40" onClick={onContinue} type="button">Continue</button>
        </div>
      ) : null}
      {importResult?.status === 'error' ? (
        <div className="mt-5 rounded-lg border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-slate-100">
          <p className="text-base font-semibold text-rose-200">Steam import needs another try</p>
          <p className="mt-1">{importResult.message}</p>
        </div>
      ) : null}
      <Actions disabled={isComplete && importResult?.status === 'success'} primary={importResult?.status === 'error' ? 'Try again' : isComplete && importResult?.status === 'success' ? 'Steam setup completed' : 'Import Steam Library'} onPrimary={importLibrary} onSkip={onSkip} loading={isLoading} />
    </div>
  );
}

function RawgStep({ onComplete, onOpenSettings }: { onComplete: () => void; onOpenSettings: () => void }) {
  const [settings, setSettings] = useState<RawgSettings>(() => loadRawgSettings());
  const [status, setStatus] = useState('Paste a RAWG key to enable metadata enrichment.');
  useEffect(() => saveRawgSettings(settings), [settings]);
  return <div><Input label="RAWG API key" value={settings.apiKey} onChange={(apiKey) => { setSettings({ apiKey }); if (apiKey.trim()) { setStatus('RAWG key saved.'); onComplete(); } }} type="password" /><Status text={status} /><Actions primary="Open enrichment settings" onPrimary={onOpenSettings} /></div>;
}

function RetroStep({ games, onComplete, onImportGames, onSkip }: { games: Game[]; onComplete: () => void; onImportGames: (games: Game[]) => Game[]; onSkip: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null); const [platform, setPlatform] = useState<RetroPlatformOverride>(autoDetectPlatformOption); const [status, setStatus] = useState('Choose a ROM folder or files to import.'); const runtime = getRuntimeEnvironment();
  useEffect(() => { inputRef.current?.setAttribute('webkitdirectory', ''); inputRef.current?.setAttribute('directory', ''); }, []);
  function scan(files: ScannableRomFile[]) { const result = scanRomFiles(files, games, platform); const existingIds = new Set(games.map((game) => game.id)); const imported = result.detectedRoms.filter((rom) => !rom.isDuplicate).map((rom) => mapDetectedRomToGame(rom, existingIds)); onImportGames(imported); setStatus(`Imported ${imported.length} retro games from ${result.summary.scannedFiles} scanned files.`); if (imported.length > 0) onComplete(); }
  async function pickAndroid() { try { const result = await RetroFolderPicker.pickFolder(); scan(result.files.map((file) => ({ name: file.name, path: file.path, uri: file.uri }))); } catch { setStatus('Folder selection was cancelled or unavailable.'); } }
  return <div><label className="block"><span className="qs-label-caps text-muted">Platform assignment</span><select className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white" value={platform} onChange={(e) => setPlatform(e.target.value as RetroPlatformOverride)}>{[autoDetectPlatformOption, ...retroImportPlatforms].map((option) => <option key={option} value={option}>{option}</option>)}</select></label><input ref={inputRef} className="hidden" multiple onChange={(e) => scan(Array.from(e.target.files ?? []))} type="file" /><div className="mt-4 flex flex-wrap gap-2"><button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950" onClick={() => runtime.isAndroid ? pickAndroid() : inputRef.current?.click()} type="button">Pick ROM Folder</button><button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={onSkip} type="button">Skip</button></div><Status text={status} /></div>;
}

function BackupStep({ onComplete, onOpenSettings }: { onComplete: () => void; onOpenSettings: () => void }) {
  const [status, setStatus] = useState('Export a portable JSON backup. Integration keys are excluded from this quick export.');
  async function exportBackup() { const result = await exportQuestShelfBackupFile(createQuestShelfBackup(false)); setStatus(`Backup exported as ${result.fileName}.`); onComplete(); }
  return <div><Status text={status} /><Actions primary="Export backup" onPrimary={() => { void exportBackup(); }} /><button className="mt-3 h-10 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={onOpenSettings} type="button">Open backup settings</button></div>;
}


function HowItWorksStep({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) {
  const stages: Array<[string, string]> = [
    ['Library', 'All your games — imported from Steam, added manually, or scanned from ROMs.'],
    ['Quest Queue', 'Review games one at a time and decide what deserves your attention.'],
    ['Platform Plans', 'Organize the games you want to play next, sorted by platform.'],
    ['Playing Now', 'Track the games you are actively playing.'],
  ];
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stages.map(([name, desc], i) => (
          <div className="rounded-lg border border-skyglass/15 bg-ink-900 p-4" key={name}>
            <div className="mb-2 text-xs font-semibold tabular-nums text-slate-600">0{i + 1}</div>
            <div className="qs-label-caps text-accent">{name}</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">{desc}</p>
          </div>
        ))}
      </div>
      <Actions primary="Got it" onPrimary={onComplete} onSkip={onSkip} />
    </div>
  );
}

function PersonalizeStep({ accentColorPreference, appTemplatePreference, gameCount, games, libraryOwnerNickname, onAccentColorChange, onAppTemplatePreferenceChange, onComplete, onSkip, onLibraryOwnerNicknameChange, onShelfIdentityChange, personalizedQuestShelfTitle, platformCount, shelfIdentity, steamAvatarUrl, steamPersonaName }: { accentColorPreference: AccentColorPreference; appTemplatePreference: AppTemplatePreference; gameCount: number; games: Game[]; libraryOwnerNickname: string; onAccentColorChange: (color: AccentColorPreference) => void; onAppTemplatePreferenceChange: (preference: AppTemplatePreference) => void; onComplete: () => void; onSkip: () => void; onLibraryOwnerNicknameChange: (nickname: string) => void; onShelfIdentityChange: (identity: ShelfIdentitySettings) => void; personalizedQuestShelfTitle: string; platformCount: number; shelfIdentity: ShelfIdentitySettings; steamAvatarUrl: string; steamPersonaName: string }) {
  const selectedAccentColor = accentColorPreference ?? defaultAccentColor;
  const accentPresets = [defaultAccentColor, '#1b75d0', '#8b5cf6', '#14b8a6', '#f59e0b'];
  const shelfExamples = [steamPersonaName, 'Loopak', 'Lukáš'].filter(Boolean);
  const previewTitle = personalizedQuestShelfTitle;
  const chooseAccent = (color: string) => { const normalizedColor = normalizeAccentColor(color); if (normalizedColor) onAccentColorChange(normalizedColor === defaultAccentColor ? null : normalizedColor); };

  return <div className="space-y-5"><div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><div className="space-y-4"><ShelfIdentityEditor identity={shelfIdentity} onIdentityChange={onShelfIdentityChange} shelfNamePlaceholder={steamPersonaName || 'Loopak'} steamAvatarUrl={steamAvatarUrl} steamPersonaName={steamPersonaName} /><label className="block"><span className="qs-label-caps text-muted">Name / Nickname</span><input className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" maxLength={maxLibraryOwnerNicknameLength} onChange={(event) => onLibraryOwnerNicknameChange(event.target.value)} placeholder="Loopak" value={libraryOwnerNickname} /></label><div className="flex flex-wrap gap-2">{shelfExamples.map((example) => <button className="rounded-full border border-skyglass/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-mint/40 hover:bg-mint/10" key={example} onClick={() => onShelfIdentityChange({ ...shelfIdentity, shelfName: example })} type="button">{example}</button>)}</div><div><div className="qs-label-caps text-muted">Theme selection</div><div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Theme selection"><button aria-pressed={appTemplatePreference === 'classic'} className={`rounded-lg border p-3 text-left ${appTemplatePreference === 'classic' ? 'border-mint/60 bg-mint/10 text-mint' : 'border-skyglass/15 text-slate-200'}`} onClick={() => onAppTemplatePreferenceChange('classic')} type="button"><strong>Default</strong><span className="mt-1 block text-xs text-slate-400">Clean dark QuestShelf identity.</span></button><button aria-pressed={appTemplatePreference === 'neon-deck'} className={`rounded-lg border p-3 text-left ${appTemplatePreference === 'neon-deck' ? 'border-mint/60 bg-mint/10 text-mint' : 'border-skyglass/15 text-slate-200'}`} onClick={() => onAppTemplatePreferenceChange('neon-deck')} type="button"><strong>Neon</strong><span className="mt-1 block text-xs text-slate-400">Arcade glow and deck-style panels.</span></button></div></div><div><div className="qs-label-caps text-muted">Accent color</div><div className="mt-2 flex flex-wrap items-center gap-2"><input className="h-11 w-16 rounded-md border border-white/10 bg-ink-900 p-1" onChange={(event) => chooseAccent(event.target.value)} type="color" value={selectedAccentColor} />{accentPresets.map((color) => <button aria-label={`Use ${color} accent`} aria-pressed={selectedAccentColor === color} className={`h-11 w-11 rounded-md border ${selectedAccentColor === color ? 'border-white shadow-glow' : 'border-white/10'}`} key={color} onClick={() => chooseAccent(color)} style={{ backgroundColor: color }} type="button" />)}</div></div></div><div className="rounded-2xl border border-mint/25 bg-ink-950/80 p-4 shadow-glow"><div className="text-xs font-semibold uppercase tracking-spread text-mint">Live preview</div><div className="mt-3 flex items-center gap-3"><ShelfAvatar {...shelfIdentity} steamAvatarUrl={steamAvatarUrl} sizeClassName="h-14 w-14" /><h4 className="text-2xl font-semibold text-white">{previewTitle}</h4></div><p className="mt-2 text-sm text-slate-400">Welcome back — your backlog, wishlist, and queue now share this Shelf Identity.</p><div className="mt-5 grid gap-2 text-sm"><span className="rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2">{gameCount} games imported</span><span className="rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2">{platformCount} platforms configured</span><span className="rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-mint">Avatar persists after restart</span></div></div></div><div className="flex flex-wrap gap-2"><button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950" onClick={onComplete} type="button">Save personalization</button><button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={onSkip} type="button">Skip for now</button></div></div>;
}


function AnalyticsStep({ analyticsSettings, onChoose }: { analyticsSettings: ReturnType<typeof loadAnalyticsSettings>; onChoose: (isEnabled: boolean) => void }) {
  const { t } = useI18n();
  const selectedChoice = analyticsSettings.hasSeenAnalyticsNotice ? analyticsSettings.isAnalyticsEnabled ? 'enabled' : 'declined' : null;
  const checklistItems = [
    t('onboarding.analyticsNoGameTitles'),
    t('onboarding.analyticsNoNotes'),
    t('onboarding.analyticsNoTags'),
    t('onboarding.analyticsNoAccountInfo'),
    t('onboarding.analyticsNoPersonalData'),
  ];

  return (
    <div className={`rounded-2xl border p-5 ${selectedChoice === 'enabled' ? 'border-mint/60 bg-mint/10 shadow-glow' : selectedChoice === 'declined' ? 'border-amber-300/40 bg-amber-300/10' : 'border-mint/25 bg-ink-950/70'}`}>
      <div className="text-xs font-semibold uppercase tracking-spread text-mint">Community Alpha</div>
      <h3 className="mt-2 text-3xl font-semibold text-white">{t('onboarding.analyticsTitle')}</h3>
      <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-slate-300">{t('onboarding.analyticsBody')}</p>
      {selectedChoice ? (
        <div className={`mt-5 rounded-lg border px-3 py-2 text-sm font-semibold ${selectedChoice === 'enabled' ? 'border-mint/50 bg-mint/10 text-mint' : 'border-amber-300/40 bg-amber-300/10 text-amber-200'}`} role="status">
          {selectedChoice === 'enabled' ? t('onboarding.analyticsEnabledConfirmation') : t('onboarding.analyticsDeclinedConfirmation')}
        </div>
      ) : null}
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {checklistItems.map((item) => (
          <li className="rounded-lg border border-skyglass/15 bg-ink-900 px-3 py-2 text-sm font-medium text-slate-200" key={item}>✓ {item}</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <button aria-pressed={selectedChoice === 'enabled'} className={`h-11 rounded-md px-4 text-sm font-semibold ${selectedChoice === 'enabled' ? 'border border-mint/50 bg-mint/20 text-mint' : 'bg-mint text-ink-950'}`} disabled={selectedChoice === 'enabled'} onClick={() => onChoose(true)} type="button">{selectedChoice === 'enabled' ? t('onboarding.analyticsEnabled') : t('onboarding.analyticsEnable')}</button>
        <button aria-pressed={selectedChoice === 'declined'} className={`h-11 rounded-md border px-4 text-sm disabled:opacity-70 ${selectedChoice === 'declined' ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-skyglass/15 text-slate-200'}`} disabled={selectedChoice !== null} onClick={() => onChoose(false)} type="button">{selectedChoice ? t('onboarding.analyticsChangeLater') : t('onboarding.analyticsNotNow')}</button>
      </div>
    </div>
  );
}

function FinishStep({
  analyticsSettings,
  gameCount,
  onAnalyticsChoose,
  onComplete,
  onOpenLibrary,
  onOpenQueue,
  personalizedQuestShelfTitle,
  platformCount,
  progress,
  shelfTitle,
}: {
  analyticsSettings: ReturnType<typeof loadAnalyticsSettings>;
  gameCount: number;
  onAnalyticsChoose: (isEnabled: boolean) => void;
  onComplete: () => void;
  onOpenLibrary: () => void;
  onOpenQueue: () => void;
  personalizedQuestShelfTitle: string;
  platformCount: number;
  progress: string;
  shelfTitle: string;
}) {
  const analyticsChoice = analyticsSettings.hasSeenAnalyticsNotice
    ? analyticsSettings.isAnalyticsEnabled
      ? 'enabled'
      : 'declined'
    : null;

  function handleExit(action: 'library' | 'queue') {
    if (!analyticsSettings.hasSeenAnalyticsNotice) {
      onAnalyticsChoose(false);
    }
    onComplete();
    if (action === 'library') onOpenLibrary();
    else onOpenQueue();
  }

  return (
    <div className="rounded-2xl border border-mint/30 bg-mint/10 p-5 text-center shadow-glow">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint text-2xl text-ink-950">✓</div>
      <h3 className="mt-4 text-3xl font-semibold text-white">Your QuestShelf is ready.</h3>
      <p className="mt-2 text-lg text-mint">{personalizedQuestShelfTitle}</p>
      {shelfTitle ? <p className="mt-1 text-sm font-semibold text-white">🏆 {shelfTitle}</p> : null}
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm text-slate-200">
        <span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1.5">{gameCount} games imported</span>
        <span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1.5">{platformCount} platforms configured</span>
        <span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1.5">Setup progress: {progress}</span>
      </div>
      <div className="mx-auto mt-5 max-w-lg rounded-xl border border-white/10 bg-ink-950/60 p-4 text-left">
        <div className="text-xs font-semibold uppercase tracking-spread text-mint">Community Alpha</div>
        <p className="mt-1 text-sm text-slate-300">Help improve QuestShelf by sharing anonymous usage stats — no game titles, notes, or personal data.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            aria-pressed={analyticsChoice === 'enabled'}
            className={`h-9 rounded-md px-4 text-sm font-semibold ${analyticsChoice === 'enabled' ? 'border border-mint/50 bg-mint/20 text-mint' : 'bg-mint text-ink-950'}`}
            disabled={analyticsChoice === 'enabled'}
            onClick={() => onAnalyticsChoose(true)}
            type="button"
          >
            {analyticsChoice === 'enabled' ? 'Analytics enabled ✓' : 'Enable anonymous analytics'}
          </button>
          <button
            aria-pressed={analyticsChoice === 'declined'}
            className={`h-9 rounded-md border px-4 text-sm ${analyticsChoice === 'declined' ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-skyglass/15 text-slate-300'}`}
            disabled={analyticsChoice !== null}
            onClick={() => onAnalyticsChoose(false)}
            type="button"
          >
            {analyticsChoice === 'declined' ? 'No analytics (change in Settings)' : 'No, thanks'}
          </button>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950" onClick={() => handleExit('library')} type="button">Start exploring</button>
        <button className="h-11 rounded-md border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint" onClick={() => handleExit('queue')} type="button">Open Platform Plans</button>
      </div>
    </div>
  );
}
function Input({ label, onChange, type = 'text', value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) { return <label className="block"><span className="qs-label-caps text-muted">{label}</span><input className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" onChange={(e) => onChange(e.target.value)} type={type} value={value} /></label>; }
function Status({ text }: { text: string }) { return <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-900 px-3 py-2 text-sm text-slate-300">{text}</div>; }
function Actions({ disabled = false, loading = false, onPrimary, onSkip, primary }: { disabled?: boolean; loading?: boolean; onPrimary: () => void; onSkip?: () => void; primary: string }) { return <div className="mt-5 flex flex-wrap gap-2"><button className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 disabled:bg-slate-600" disabled={disabled || loading} onClick={onPrimary} type="button">{loading ? 'Working...' : primary}</button>{onSkip ? <button className="h-11 rounded-md border border-skyglass/15 px-4 text-sm text-slate-200" onClick={onSkip} type="button">Skip</button> : null}</div>; }
