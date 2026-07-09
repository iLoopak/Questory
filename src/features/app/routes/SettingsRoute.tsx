import { Suspense, lazy } from 'react';
import { initialCollectionFilters } from '../../../config/collection';
import { PanelLoadingFallback } from '../../../components/PanelLoadingFallback';
import type { AppSectionRouterProps } from '../AppSectionRouter';

const SettingsView = lazy(() => import('../../settings/SettingsView').then((m) => ({ default: m.SettingsView })));

type SettingsRouteProps = Pick<AppSectionRouterProps, 'activeSettingsCategory' | 'autoBackupSignal' | 'setupTasks' | 'setIsAddGameOpen' | 'games' | 'syncSteamAchievements' | 'completedOnboardingItemIds' | 'skippedOnboardingItemIds' | 'ignoredSteamGames' | 'libraryOwnerNickname' | 'personalizedQuestShelfTitle' | 'shelfIdentity' | 'questShelfAchievements' | 'computedShelfTitle' | 'steamAvatarUrl' | 'steamPersonaName' | 'controllerProfileId' | 'detectedProfileId' | 'isControllerDebugEnabled' | 'isLandscapeLockEnabled' | 'isOnboardingOpen' | 'isOnboardingComplete' | 'areLastRetroImportsHiddenByFilters' | 'resolvedTheme' | 'runtimeEnvironment' | 'themePreference' | 'appTemplatePreference' | 'accentColorPreference' | 'secondaryAccentColorPreference' | 'gradientOrientationPreference' | 'neonButtonGradientBalancePreference' | 'neonButtonGradientMidpointPreference' | 'neonButtonStylePreference' | 'language' | 'navigationVisibility' | 'platformQueueState' | 'steamPlaytimeRefreshState' | 'steamWishlistSyncState' | 'addRetroImportedGamesToQueue' | 'handleBackupExported' | 'handleBackupImported' | 'setActiveSettingsCategory' | 'setLibraryOwnerNickname' | 'setShelfIdentity' | 'handleSteamProfileNameChange' | 'markOnboardingItemComplete' | 'setLibraryFilters' | 'enrichRetroImportedGames' | 'importSteamGames' | 'handleRetroImportGames' | 'setIsControllerDebugEnabled' | 'setControllerProfileId' | 'setIsLandscapeLockEnabled' | 'setNavigationVisibility' | 'handleOnboardingAction' | 'hideOnboarding' | 'skipOnboardingItem' | 'openOnboarding' | 'restartOnboarding' | 'setPlatformQueueState' | 'setIsRawgApiKeySet' | 'refreshSteamPlaytime' | 'markOnboardingItemsComplete' | 'importMultiGameItemsWithAnalytics' | 'importSteamWishlistHtmlItemsWithAnalytics' | 'syncSteamWishlist' | 'startReviewMode' | 'setThemePreference' | 'setAppTemplatePreference' | 'setAccentColorPreference' | 'setSecondaryAccentColorPreference' | 'setGradientOrientationPreference' | 'setNeonButtonGradientBalancePreference' | 'setNeonButtonGradientMidpointPreference' | 'setNeonButtonStylePreference' | 'setLanguage' | 'unignoreSteamGame' | 'viewRetroImportedGames'>;
export function SettingsRoute({ activeSettingsCategory, autoBackupSignal, setupTasks, setIsAddGameOpen, games, syncSteamAchievements, completedOnboardingItemIds, skippedOnboardingItemIds, ignoredSteamGames, libraryOwnerNickname, personalizedQuestShelfTitle, shelfIdentity, questShelfAchievements, computedShelfTitle, steamAvatarUrl, steamPersonaName, controllerProfileId, detectedProfileId, isControllerDebugEnabled, isLandscapeLockEnabled, isOnboardingOpen, isOnboardingComplete, areLastRetroImportsHiddenByFilters, resolvedTheme, runtimeEnvironment, themePreference, appTemplatePreference, accentColorPreference, secondaryAccentColorPreference, gradientOrientationPreference, neonButtonGradientBalancePreference, neonButtonGradientMidpointPreference, neonButtonStylePreference, language, navigationVisibility, platformQueueState, steamPlaytimeRefreshState, steamWishlistSyncState, addRetroImportedGamesToQueue, handleBackupExported, handleBackupImported, setActiveSettingsCategory, setLibraryOwnerNickname, setShelfIdentity, handleSteamProfileNameChange, markOnboardingItemComplete, setLibraryFilters, enrichRetroImportedGames, importSteamGames, handleRetroImportGames, setIsControllerDebugEnabled, setControllerProfileId, setIsLandscapeLockEnabled, setNavigationVisibility, handleOnboardingAction, hideOnboarding, skipOnboardingItem, openOnboarding, restartOnboarding, setPlatformQueueState, setIsRawgApiKeySet, refreshSteamPlaytime, markOnboardingItemsComplete, importMultiGameItemsWithAnalytics, importSteamWishlistHtmlItemsWithAnalytics, syncSteamWishlist, startReviewMode, setThemePreference, setAppTemplatePreference, setAccentColorPreference, setSecondaryAccentColorPreference, setGradientOrientationPreference, setNeonButtonGradientBalancePreference, setNeonButtonGradientMidpointPreference, setNeonButtonStylePreference, setLanguage, unignoreSteamGame, viewRetroImportedGames }: SettingsRouteProps) {
  return (
    <Suspense fallback={<PanelLoadingFallback />}>
      <SettingsView
          activeCategory={activeSettingsCategory}
          autoBackupSignal={autoBackupSignal}
          setupTasks={setupTasks}
          onAddGame={() => setIsAddGameOpen(true)}
          onSyncAchievements={() => {
            const allSteamGameIds = games
              .filter((g) => g.collectionType === 'library' && typeof g.steamAppId === 'number')
              .map((g) => g.id);
            void syncSteamAchievements(allSteamGameIds, { showToast: true });
          }}
          completedOnboardingItemIds={completedOnboardingItemIds}
          skippedOnboardingItemIds={skippedOnboardingItemIds}
          games={games}
          ignoredSteamGames={ignoredSteamGames}
          libraryOwnerNickname={libraryOwnerNickname}
          personalizedQuestShelfTitle={personalizedQuestShelfTitle}
          shelfIdentity={shelfIdentity}
          questShelfAchievements={questShelfAchievements}
          activeAchievementTitle={computedShelfTitle}
          steamAvatarUrl={steamAvatarUrl}
          steamPersonaName={steamPersonaName}
          controllerProfileId={controllerProfileId}
          detectedProfileId={detectedProfileId}
          isControllerDebugEnabled={isControllerDebugEnabled}
          isLandscapeLockEnabled={isLandscapeLockEnabled}
          isOnboardingOpen={isOnboardingOpen}
          isOnboardingComplete={isOnboardingComplete}
          lastRetroImportsHiddenByFilters={areLastRetroImportsHiddenByFilters}
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
          navigationVisibility={navigationVisibility}
          platformQueueState={platformQueueState}
          steamPlaytimeRefreshState={steamPlaytimeRefreshState}
          steamWishlistSyncState={steamWishlistSyncState}
          onAddRetroImportedToQueue={addRetroImportedGamesToQueue}
          onBackupExported={handleBackupExported}
          onBackupImported={handleBackupImported}
          onCategoryChange={setActiveSettingsCategory}
          onLibraryOwnerNicknameChange={setLibraryOwnerNickname}
          onShelfIdentityChange={setShelfIdentity}
          onSteamAvatarImported={handleSteamProfileNameChange}
          onConnectionTested={() => markOnboardingItemComplete('steam-test')}
          onClearLibraryFilters={() => setLibraryFilters(initialCollectionFilters)}
          onEnrichRetroImportedGames={enrichRetroImportedGames}
          onImportGames={importSteamGames}
          onImportRetroGames={handleRetroImportGames}
          onControllerDebugChange={setIsControllerDebugEnabled}
          onControllerProfileChange={setControllerProfileId}
          onLandscapeLockChange={setIsLandscapeLockEnabled}
          onNavigationVisibilityChange={setNavigationVisibility}
          onOnboardingAction={handleOnboardingAction}
          onOnboardingClose={hideOnboarding}
          onOnboardingComplete={markOnboardingItemComplete}
          onOnboardingSkip={skipOnboardingItem}
          onOpenOnboarding={openOnboarding}
          onRestartOnboarding={restartOnboarding}
          onPlatformQueueStateChange={setPlatformQueueState}
          onRawgApiKeyConfigured={() => {
            markOnboardingItemComplete('rawg-api-key');
            setIsRawgApiKeySet(true);
          }}
          onRefreshSteamPlaytime={() => refreshSteamPlaytime()}
          onSteamApiKeyConfigured={() => markOnboardingItemComplete('steam-api-key')}
          onSteamIdConfigured={() => markOnboardingItemComplete('steam-id64')}
          onSteamProfileNameChange={handleSteamProfileNameChange}
          onSteamLibraryImported={() => markOnboardingItemsComplete(['steam-import', 'steam-connect'])}
          onImportMultiGames={importMultiGameItemsWithAnalytics}
          onImportSteamWishlistHtml={importSteamWishlistHtmlItemsWithAnalytics}
          onSyncSteamWishlist={syncSteamWishlist}
          onReviewRetroImportedGames={() => startReviewMode('recent-imports')}
          onThemePreferenceChange={setThemePreference}
          onAppTemplatePreferenceChange={setAppTemplatePreference}
          onAccentColorChange={setAccentColorPreference}
          onSecondaryAccentColorChange={setSecondaryAccentColorPreference}
          onGradientOrientationChange={setGradientOrientationPreference}
          onNeonButtonGradientBalanceChange={setNeonButtonGradientBalancePreference}
          onNeonButtonGradientMidpointChange={setNeonButtonGradientMidpointPreference}
          onNeonButtonStyleChange={setNeonButtonStylePreference}
          onLanguageChange={setLanguage}
          onUnignoreSteamGame={unignoreSteamGame}
          onViewRetroImportedGames={viewRetroImportedGames}
      />
    </Suspense>
  );
}
