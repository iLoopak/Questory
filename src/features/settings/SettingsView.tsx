import { useMemo, useRef, useState } from 'react';
import { DataManagementPanel } from '../../components/DataManagementPanel';
import { HltbSettingsPanel } from '../../components/HltbSettingsPanel';
import { IsThereAnyDealSettingsPanel } from '../../components/IsThereAnyDealSettingsPanel';
import { RawgSettingsPanel } from '../../components/RawgSettingsPanel';
import { RetroImportPanel } from '../../components/RetroImportPanel';
import { SteamGridDbSettingsPanel } from '../../components/SteamGridDbSettingsPanel';
import { SteamSettingsPanel } from '../../components/SteamSettingsPanel';
import { AboutSettingsPanel } from '../../components/settings/AboutSettingsPanel';
import { AppearanceSettingsPanel } from '../../components/settings/AppearanceSettingsPanel';
import { ControlsSettingsPanel } from '../../components/settings/ControlsSettingsPanel';
import { NavigationVisibilitySettingsPanel } from '../../components/settings/NavigationVisibilitySettingsPanel';
import { PersonalizationSettingsPanel } from '../../components/settings/PersonalizationSettingsPanel';
import { QueuePlatformsSettingsPanel } from '../../components/settings/PlatformsSettingsPanel';
import { SettingsSection } from '../../components/settings/SettingsSection';
import { SteamWishlistHtmlImportModal, WishlistSettingsPanel } from '../../components/settings/WishlistSettingsPanel';
import { getSettingsCategoryMeta, settingsCategories, type SettingsCategory } from '../../config/settings';
import { createTranslator, translateSettingsCategory, useI18n, type AppLanguage } from '../../i18n';
import { getRuntimeEnvironment } from '../../lib/capacitorEnvironment';
import type { ControllerLayoutPreference } from '../../lib/controllerLayoutPreferences';
import { getQuestShelfAchievements } from '../../lib/questShelfAchievements';
import type { NavigationVisibilityPreferences } from '../../lib/navigationVisibilityPreferences';
import { onboardingItemIds, type OnboardingItemId } from '../../lib/onboardingStorage';
import type { PlatformQueueState } from '../../lib/platformQueueStorage';
import type { ShelfIdentitySettings } from '../../lib/shelfIdentity';
import type { AccentColorPreference, AppTemplatePreference, GradientOrientationPreference, NeonButtonStylePreference, ResolvedTheme, ThemePreference } from '../../lib/themePreferences';
import type { ParsedSteamWishlistImportItem } from '../../lib/steamWishlistHtmlImport';
import type { IgnoredSteamGame } from '../../lib/steamIgnoredGamesStorage';
import type { SteamWishlistHtmlImportSummary } from '../../utils/summaryFormatters';
import type { Game } from '../../types/game';
import type { SteamPlaytimeRefreshState, SteamPlaytimeRefreshSummary, SteamWishlistSyncState } from '../../types/steam';

export type SettingsViewProps = {
  activeCategory: SettingsCategory;
  autoBackupSignal: string;
  completedOnboardingItemIds: Set<OnboardingItemId>;
  skippedOnboardingItemIds: Set<OnboardingItemId>;
  games: Game[];
  ignoredSteamGames: IgnoredSteamGame[];
  libraryOwnerNickname: string;
  personalizedQuestShelfTitle: string;
  shelfIdentity: ShelfIdentitySettings;
  questShelfAchievements: ReturnType<typeof getQuestShelfAchievements>;
  activeAchievementTitle: string;
  steamAvatarUrl: string;
  steamPersonaName: string;
  controllerLayoutPreference: ControllerLayoutPreference;
  isControllerDebugEnabled: boolean;
  isLandscapeLockEnabled: boolean;
  isOnboardingComplete: boolean;
  isOnboardingOpen: boolean;
  lastRetroImportsHiddenByFilters: boolean;
  resolvedTheme: ResolvedTheme;
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
  themePreference: ThemePreference;
  appTemplatePreference: AppTemplatePreference;
  accentColorPreference: AccentColorPreference;
  secondaryAccentColorPreference: AccentColorPreference;
  gradientOrientationPreference: GradientOrientationPreference;
  neonButtonGradientBalancePreference: number;
  neonButtonGradientMidpointPreference: number;
  neonButtonStylePreference: NeonButtonStylePreference;
  language: AppLanguage;
  navigationVisibility: NavigationVisibilityPreferences;
  platformQueueState: PlatformQueueState;
  steamPlaytimeRefreshState: SteamPlaytimeRefreshState;
  steamWishlistSyncState: SteamWishlistSyncState;
  onAddRetroImportedToQueue: (gameIds: string[]) => void;
  onBackupExported: () => void;
  onBackupImported: () => void;
  onCategoryChange: (category: SettingsCategory) => void;
  onLibraryOwnerNicknameChange: (nickname: string) => void;
  onShelfIdentityChange: (identity: ShelfIdentitySettings) => void;
  onSteamAvatarImported?: (personaName: string) => void;
  onClearLibraryFilters: () => void;
  onConnectionTested: () => void;
  onEnrichRetroImportedGames: (gameIds: string[]) => void;
  onImportGames: (games: Game[]) => void;
  onImportRetroGames: (games: Game[]) => Game[];
  onControllerDebugChange: (isEnabled: boolean) => void;
  onControllerLayoutChange: (preference: ControllerLayoutPreference) => void;
  onLandscapeLockChange: (isEnabled: boolean) => void;
  onNavigationVisibilityChange: (preferences: NavigationVisibilityPreferences) => void;
  onOnboardingAction: (itemId: OnboardingItemId, action?: 'primary' | 'secondary') => void;
  onOnboardingClose: () => void;
  onOnboardingComplete: (itemId: OnboardingItemId) => void;
  onOnboardingSkip: (itemId: OnboardingItemId) => void;
  onOpenOnboarding: () => void;
  onRestartOnboarding: () => void;
  onPlatformQueueStateChange: (state: PlatformQueueState) => void;
  onRawgApiKeyConfigured: () => void;
  onRefreshSteamPlaytime: () => Promise<SteamPlaytimeRefreshSummary | null>;
  onReviewRetroImportedGames: () => void;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onAppTemplatePreferenceChange: (preference: AppTemplatePreference) => void;
  onAccentColorChange: (color: AccentColorPreference) => void;
  onSecondaryAccentColorChange: (color: AccentColorPreference) => void;
  onGradientOrientationChange: (orientation: GradientOrientationPreference) => void;
  onNeonButtonGradientBalanceChange: (balance: number) => void;
  onNeonButtonGradientMidpointChange: (midpoint: number) => void;
  onNeonButtonStyleChange: (style: NeonButtonStylePreference) => void;
  onLanguageChange: (language: AppLanguage) => void;
  onSteamApiKeyConfigured: () => void;
  onSteamIdConfigured: () => void;
  onSteamLibraryImported: () => void;
  onImportSteamWishlistHtml: (items: ParsedSteamWishlistImportItem[], skippedCount?: number) => SteamWishlistHtmlImportSummary;
  onSyncSteamWishlist: () => void;
  onSteamProfileNameChange: (profileName: string) => void;
  onUnignoreSteamGame: (steamAppId: number) => void;
  onViewRetroImportedGames: (gameIds: string[]) => void;
};

export function SettingsView({
  activeCategory,
  autoBackupSignal,
  completedOnboardingItemIds,
  skippedOnboardingItemIds,
  games,
  ignoredSteamGames,
  libraryOwnerNickname,
  personalizedQuestShelfTitle,
  shelfIdentity,
  questShelfAchievements,
  activeAchievementTitle,
  steamAvatarUrl,
  steamPersonaName,
  controllerLayoutPreference,
  isControllerDebugEnabled,
  isLandscapeLockEnabled,
  isOnboardingComplete,
  isOnboardingOpen,
  lastRetroImportsHiddenByFilters,
  resolvedTheme,
  runtimeEnvironment,
  themePreference,
  appTemplatePreference,
  accentColorPreference,
  secondaryAccentColorPreference,
  gradientOrientationPreference,
  neonButtonGradientBalancePreference,
  neonButtonGradientMidpointPreference,
  neonButtonStylePreference,
  language,
  navigationVisibility,
  platformQueueState,
  steamPlaytimeRefreshState,
  steamWishlistSyncState,
  onAddRetroImportedToQueue,
  onBackupExported,
  onBackupImported,
  onCategoryChange,
  onLibraryOwnerNicknameChange,
  onShelfIdentityChange,
  onSteamAvatarImported,
  onClearLibraryFilters,
  onConnectionTested,
  onEnrichRetroImportedGames,
  onImportGames,
  onImportRetroGames,
  onControllerDebugChange,
  onControllerLayoutChange,
  onLandscapeLockChange,
  onNavigationVisibilityChange,
  onOnboardingAction,
  onOnboardingClose,
  onOnboardingComplete,
  onOnboardingSkip,
  onOpenOnboarding,
  onRestartOnboarding,
  onPlatformQueueStateChange,
  onRawgApiKeyConfigured,
  onRefreshSteamPlaytime,
  onReviewRetroImportedGames,
  onThemePreferenceChange,
  onAppTemplatePreferenceChange,
  onAccentColorChange,
  onSecondaryAccentColorChange,
  onGradientOrientationChange,
  onLanguageChange,
  onNeonButtonGradientBalanceChange,
  onNeonButtonGradientMidpointChange,
  onNeonButtonStyleChange,
  onSteamApiKeyConfigured,
  onSteamIdConfigured,
  onSteamLibraryImported,
  onImportSteamWishlistHtml,
  onSyncSteamWishlist,
  onSteamProfileNameChange,
  onUnignoreSteamGame,
  onViewRetroImportedGames,
}: SettingsViewProps) {
  const [isCategoryListOpen, setIsCategoryListOpen] = useState(false);
  const [isSteamWishlistHtmlImportOpen, setIsSteamWishlistHtmlImportOpen] = useState(false);
  const steamWishlistImportButtonRef = useRef<HTMLButtonElement | null>(null);
  const activeCategoryMeta = getSettingsCategoryMeta(activeCategory);
  const t = useMemo(() => createTranslator(language), [language]);
  const onboardingFinishedCount = onboardingItemIds.filter(
    (itemId) => completedOnboardingItemIds.has(itemId) || skippedOnboardingItemIds.has(itemId),
  ).length;

  function selectCategory(category: SettingsCategory) {
    onCategoryChange(category);
    setIsCategoryListOpen(false);
  }

  return (
    <section className="qs-settings-shell min-w-0 rounded-lg border border-skyglass/15 bg-ink-900/45">
      <div className="qs-settings-shell-header border-b border-skyglass/15 bg-ink-950/90 px-3 py-3 backdrop-blur sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">{t('settings.title')}</div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-slate-400">
              <span>{t('settings.title')}</span>
              <span className="text-slate-600">/</span>
              <span className="truncate font-semibold text-white">{translateSettingsCategory(activeCategoryMeta.label, t)}</span>
            </div>
          </div>
          <button
            className="qs-settings-back h-11 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white lg:hidden"
            onClick={() => setIsCategoryListOpen((currentValue) => !currentValue)}
            type="button"
          >
            {isCategoryListOpen ? t('settings.showDetail') : t('settings.backToCategories')}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className={`qs-settings-list border-b border-skyglass/15 bg-ink-950/70 p-3 lg:block lg:border-b-0 lg:border-r ${
            isCategoryListOpen ? 'block' : 'hidden'
          }`}
        >
          <nav className="qs-settings-tabs grid gap-2">
            {settingsCategories.map((category) => (
              <SettingsCategoryButton
                key={category}
                category={category}
                isActive={category === activeCategory}
                onSelect={selectCategory}
              />
            ))}
          </nav>
        </aside>

        <div className={`qs-settings-detail p-3 sm:p-4 ${isCategoryListOpen ? 'hidden lg:block' : 'block'}`}>
          <header className="mb-4 rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-mint/25 bg-mint/10 text-mint">
                <SettingsCategoryIcon category={activeCategory} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-white">{translateSettingsCategory(activeCategoryMeta.label, t)}</h2>
                {activeCategoryMeta.description ? (
                  <p className="mt-1 text-sm leading-5 text-slate-400">{activeCategoryMeta.description}</p>
                ) : null}
              </div>
            </div>
          </header>

          {activeCategory === 'Integrations' ? (
            <div className="space-y-4">
              <RawgSettingsPanel onRawgApiKeyConfigured={onRawgApiKeyConfigured} />
              <IsThereAnyDealSettingsPanel />
              <SteamGridDbSettingsPanel />
              <HltbSettingsPanel />
              <SteamSettingsPanel
                games={games}
                ignoredSteamGames={ignoredSteamGames}
                onConnectionTested={onConnectionTested}
                onImportGames={onImportGames}
                onSteamApiKeyConfigured={onSteamApiKeyConfigured}
                onSteamIdConfigured={onSteamIdConfigured}
                onSteamLibraryImported={onSteamLibraryImported}
                onSteamProfileNameChange={onSteamProfileNameChange}
                playtimeRefreshState={steamPlaytimeRefreshState}
                onRefreshSteamPlaytime={onRefreshSteamPlaytime}
                onUnignoreSteamGame={onUnignoreSteamGame}
                onOpenManualWishlistImport={() => setIsSteamWishlistHtmlImportOpen(true)}
                manualWishlistImportButtonRef={steamWishlistImportButtonRef}
              />
            </div>
          ) : null}


          {activeCategory === 'Wishlist' ? (
            <WishlistSettingsPanel
              existingSteamAppIds={games
                .filter((game) => game.collectionType === 'wishlist' && typeof game.steamAppId === 'number')
                .map((game) => game.steamAppId as number)}
              steamWishlistSyncState={steamWishlistSyncState}
              onImportSteamWishlistHtml={onImportSteamWishlistHtml}
              onSyncSteamWishlist={onSyncSteamWishlist}
            />
          ) : null}

          {isSteamWishlistHtmlImportOpen ? (
            <SteamWishlistHtmlImportModal
              existingSteamAppIds={games
                .filter((game) => game.collectionType === 'wishlist' && typeof game.steamAppId === 'number')
                .map((game) => game.steamAppId as number)}
              isExperimentalSyncLoading={steamWishlistSyncState.status === 'loading'}
              onClose={() => setIsSteamWishlistHtmlImportOpen(false)}
              onExperimentalSync={onSyncSteamWishlist}
              onImport={onImportSteamWishlistHtml}
              restoreFocusRef={steamWishlistImportButtonRef}
            />
          ) : null}

          {activeCategory === 'Platforms' ? (
            <QueuePlatformsSettingsPanel games={games} queueState={platformQueueState} onQueueStateChange={onPlatformQueueStateChange} />
          ) : null}

          {activeCategory === 'Retro' ? (
            <div className="space-y-4">
              <RetroImportPanel
                games={games}
                importedGamesHiddenByFilters={lastRetroImportsHiddenByFilters}
                onAddImportedToQueue={onAddRetroImportedToQueue}
                onClearLibraryFilters={onClearLibraryFilters}
                onEnrichImportedGames={onEnrichRetroImportedGames}
                onImportGames={onImportRetroGames}
                onReviewImportedGames={onReviewRetroImportedGames}
                onViewImportedGames={onViewRetroImportedGames}
              />
            </div>
          ) : null}

          {activeCategory === 'Personalization' ? (
            <div className="space-y-4">
              <PersonalizationSettingsPanel
                personalizedQuestShelfTitle={personalizedQuestShelfTitle}
                shelfIdentity={shelfIdentity}
                games={games}
                achievements={questShelfAchievements}
                activeAchievementTitle={activeAchievementTitle}
                steamAvatarUrl={steamAvatarUrl}
                steamPersonaName={steamPersonaName}
                onShelfIdentityChange={onShelfIdentityChange}
                onSteamAvatarImported={onSteamAvatarImported}
              />
              <NavigationVisibilitySettingsPanel
                navigationVisibility={navigationVisibility}
                onNavigationVisibilityChange={onNavigationVisibilityChange}
                t={t}
              />
            </div>
          ) : null}

          {activeCategory === 'Data & Backup' ? (
            <DataManagementPanel autoBackupSignal={autoBackupSignal} onBackupExported={onBackupExported} onBackupImported={onBackupImported} />
          ) : null}

          {activeCategory === 'Appearance' ? (
            <div className="space-y-4">
              <AppearanceSettingsPanel
                resolvedTheme={resolvedTheme}
                runtimeEnvironment={runtimeEnvironment}
                themePreference={themePreference}
                appTemplatePreference={appTemplatePreference}
                accentColorPreference={accentColorPreference}
                secondaryAccentColorPreference={secondaryAccentColorPreference}
                gradientOrientationPreference={gradientOrientationPreference}
                neonButtonGradientBalancePreference={neonButtonGradientBalancePreference}
                neonButtonGradientMidpointPreference={neonButtonGradientMidpointPreference}
                neonButtonStylePreference={neonButtonStylePreference}
                language={language}
                onThemePreferenceChange={onThemePreferenceChange}
                onAppTemplatePreferenceChange={onAppTemplatePreferenceChange}
                onAccentColorChange={onAccentColorChange}
                onSecondaryAccentColorChange={onSecondaryAccentColorChange}
                onGradientOrientationChange={onGradientOrientationChange}
                onNeonButtonGradientBalanceChange={onNeonButtonGradientBalanceChange}
                onNeonButtonGradientMidpointChange={onNeonButtonGradientMidpointChange}
                onNeonButtonStyleChange={onNeonButtonStyleChange}
                onLanguageChange={onLanguageChange}
              />
            </div>
          ) : null}

          {activeCategory === 'Controls' ? (
            <ControlsSettingsPanel
              controllerLayoutPreference={controllerLayoutPreference}
              isControllerDebugEnabled={isControllerDebugEnabled}
              isLandscapeLockEnabled={isLandscapeLockEnabled}
              language={language}
              runtimeEnvironment={runtimeEnvironment}
              onControllerDebugChange={onControllerDebugChange}
              onControllerLayoutChange={onControllerLayoutChange}
              onLandscapeLockChange={onLandscapeLockChange}
            />
          ) : null}

          {activeCategory === 'About' ? (
            <div className="space-y-4">
              <AboutSettingsPanel runtimeEnvironment={runtimeEnvironment} />
              <OnboardingSettingsPanel
                completedCount={onboardingFinishedCount}
                isComplete={isOnboardingComplete}
                onOpenOnboarding={onOpenOnboarding}
                onRestartOnboarding={onRestartOnboarding}
              />
              <HintsSettingsPanel />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SettingsCategoryButton({
  category,
  isActive,
  onSelect,
}: {
  category: SettingsCategory;
  isActive: boolean;
  onSelect: (category: SettingsCategory) => void;
}) {
  const meta = getSettingsCategoryMeta(category);
  const { t } = useI18n();

  return (
    <button
      aria-current={isActive ? 'page' : undefined}
      className={`grid min-h-12 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
        isActive
          ? 'border-mint/50 bg-mint/15 text-white shadow-glow'
          : 'border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/30 hover:bg-mint/10 hover:text-white'
      }`}
      onClick={() => onSelect(category)}
      type="button"
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-md border ${
          isActive ? 'border-mint/40 bg-mint text-ink-950' : 'border-skyglass/15 bg-ink-950 text-mint'
        }`}
      >
        <SettingsCategoryIcon category={category} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{translateSettingsCategory(meta.label, t)}</span>
        {meta.shortDescription ? (
          <span className="mt-0.5 block truncate text-xs text-slate-500">{meta.shortDescription}</span>
        ) : null}
      </span>
    </button>
  );
}

function SettingsCategoryIcon({ category }: { category: SettingsCategory }) {
  const commonProps = {
    className: 'h-5 w-5',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
    viewBox: '0 0 24 24',
  };

  if (category === 'Integrations') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M7 7h4v4H7z" />
        <path d="M13 13h4v4h-4z" />
        <path d="M11 9h4a2 2 0 0 1 2 2v2" />
        <path d="M13 15H9a2 2 0 0 1-2-2v-2" />
      </svg>
    );
  }


  if (category === 'Wishlist') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
      </svg>
    );
  }

  if (category === 'Retro') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M7 9h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L14 15h-4l-1.6 1.8A3 3 0 0 1 3 15v-2a4 4 0 0 1 4-4z" />
        <path d="M8 12v3" />
        <path d="M6.5 13.5h3" />
        <path d="M16.5 13h.01" />
        <path d="M18.5 15h.01" />
      </svg>
    );
  }

  if (category === 'Appearance') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9 4.5 4.5 0 0 1-9-9z" />
      </svg>
    );
  }

  if (category === 'Controls') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <rect x="2" y="8" width="20" height="8" rx="3" />
        <path d="M8 12h.01" />
        <path d="M12 10v4" />
        <path d="M10 12h4" />
        <circle cx="16" cy="12" r="1" />
        <circle cx="18" cy="10.5" r="0.5" />
      </svg>
    );
  }

  if (category === 'Personalization') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0" />
        <path d="M17.5 6.5h.01" />
      </svg>
    );
  }

  if (category === 'Data & Backup') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    );
  }

  return (
    <svg {...commonProps} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 17v-5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function OnboardingSettingsPanel({
  completedCount,
  isComplete,
  onOpenOnboarding,
  onRestartOnboarding,
}: {
  completedCount: number;
  isComplete: boolean;
  onOpenOnboarding: () => void;
  onRestartOnboarding: () => void;
}) {
  const { t } = useI18n();

  return (
    <SettingsSection
      title={isComplete ? t('settings.setupComplete') : t('settings.setupAssistant')}
      description={`${completedCount} setup items finished or skipped. Reopen the assistant to continue guidance, or restart it from the beginning.`}
      actions={(
        <>
          <button
            className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
            onClick={onOpenOnboarding}
            type="button"
          >
            {t('settings.reopenSetup')}
          </button>
          <button
            className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onRestartOnboarding}
            type="button"
          >
            Restart setup
          </button>
        </>
      )}
    />
  );
}

const hintStorageKeys = [
  'qs-review-hint-v1',
  'qs-queue-hint-v1',
  'qs-workflow-strip-v1',
  'qs-home-progress-v1',
] as const;

function HintsSettingsPanel() {
  const [restored, setRestored] = useState(false);

  function resetHints() {
    hintStorageKeys.forEach((key) => localStorage.removeItem(key));
    setRestored(true);
  }

  return (
    <SettingsSection
      title="Hints & Guidance"
      description="Restore educational hints and orientation panels that you previously dismissed."
      actions={(
        restored ? (
          <span className="text-sm text-mint">Hints restored — reload to see them.</span>
        ) : (
          <button
            className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={resetHints}
            type="button"
          >
            Show Hints Again
          </button>
        )
      )}
    />
  );
}

