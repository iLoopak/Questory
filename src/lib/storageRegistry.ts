export type QuestShelfStorageKey =
  | 'questshelf.achievementCounters.v1'
  | 'questshelf.games.v1'
  | 'questshelf.rawgMetadataCache.v1'
  | 'questshelf.screenshots.v1'
  | 'questshelf.personalRecommendations.v1'
  | 'questshelf.personalRecommendations.v2'
  | 'questshelf.discoveryInbox.v1'
  | 'questshelf.recommendationFeedback.v1'
  | 'questshelf.recommendationExposure.v1'
  | 'questshelf.recommendationPreferences.v1'
  | 'questshelf.tasteProfile.v1'
  | 'questshelf.releaseCalendar.v2'
  | 'questshelf.rawgSettings.v1'
  | 'questshelf.steamGridDbSettings.v1'
  | 'questshelf.isThereAnyDealSettings.v1'
  | 'questshelf.steamIgnoredGames.v1'
  | 'questshelf.steamSettings.v1'
  | 'questshelf.libraryFilters.v1'
  | 'questshelf.wishlistFilters.v1'
  | 'questshelf.onboarding.v1'
  | 'questshelf.platformQueues.v1'
  | 'questshelf.playActivity.v1'
  | 'questshelf.reviewMode.v1'
  | 'questshelf.syncFolderSettings.v1'
  | 'questshelf.installHintDismissed.v1'
  | 'questshelf.landscapeLock.v1'
  | 'questshelf.settingsCategory.v1'
  | 'questshelf.themePreference.v1'
  | 'questshelf.accentColor.v1'
  | 'questshelf.secondaryAccentColor.v1'
  | 'questshelf.neonButtonGradientBalance.v1'
  | 'questshelf.neonButtonGradientMidpoint.v1'
  | 'questshelf.gradientOrientation.v1'
  | 'questshelf.appTemplate.v1'
  | 'questshelf.appPersonalization.v1'
  | 'questshelf.shelfIdentity.v1'
  | 'questshelf.languagePreference.v1'
  | 'questshelf.navigationVisibility.v1'
  | 'questshelf.homeWidgets.v1'
  | 'questshelf.analyticsSettings.v1'
  | 'questshelf.storageIssues.v1'
  // AS-18: active keys that existed outside the registry until this PR.
  | 'questshelf.controllerSettings.v1'
  | 'questshelf.controllerDebug.v1'
  | 'questshelf.neonButtonStyle.v1'
  | 'questshelf.tasteProfile.dragHintSeen.v1'
  | 'questshelf.telemetryDebug.v1'
  | 'questshelf.hltbCache.v1'
  | 'questshelf.dailyQuest.sessions.v1'
  | 'questshelf.achievementQuiz.sessions.v1'
  | 'questshelf.achievementQuiz.selectedGames.v1'
  | 'questshelf.questRunner.hs.v1'
  | 'questshelf.releaseCalendarIgnoredRawgIds.v1'
  | 'questshelf:retro-import:last-android-folder-uri'
  | 'questshelf.pendingUndoActions.v2'
  | 'questshelf.syncFolder.v1'
  | 'questory.preRestoreSnapshot.v1'
  | 'qs-home-progress-v1'
  | 'qs-workflow-strip-v1'
  | 'qs-queue-hint-v1'
  | 'qs-review-hint-v1'
  | 'qs-queue-ghost-unlocked-achievements-v1'
  | 'qs-hero-recent-eggs'
  | 'qs-ghost-v1';

/**
 * What the value IS, which is what decides how it may be treated:
 *   core        — product-owned user data (the library, plans, profile, feedback).
 *   integration — provider credentials and connection settings. Sensitive.
 *   device      — a setting that belongs to this device/install, not to the user's data.
 *   ui          — a preference or a dismissed hint. Cosmetic; losing it costs nothing.
 *   cache       — disposable. Re-derivable from a provider or from the library at any time.
 *   recovery    — evidence kept so a failed restore can be undone. Survives a reset by design.
 *   session     — lives for one browser session and is never mirrored anywhere.
 */
export type StorageKeyScope = 'core' | 'integration' | 'device' | 'ui' | 'cache' | 'recovery' | 'session';

/**
 * Where a key's data lives. 'kv' = the JSON-per-key localStorage + Capacitor Preferences
 * path (the default). 'collection' = an IndexedDB-backed store; such keys are NOT mirrored
 * to / hydrated from Capacitor Preferences. `questshelf.games.v1` (Wave 3),
 * `questshelf.rawgMetadataCache.v1` (Wave 4), and `questshelf.playActivity.v1` (Wave 4b)
 * are 'collection'; they keep their key names so backups stay compatible.
 */
export type StorageKeyStore = 'kv' | 'collection' | 'local' | 'session';

/**
 * What Reset Local Data does with the value.
 *   remove             — deleted.
 *   preserve           — deliberately kept (recovery evidence; a reset must not destroy the
 *                        snapshot that lets a bad restore be undone).
 *   generated-family   — cleaned by prefix, through its registered family entry.
 */
export type StorageResetPolicy = 'remove' | 'preserve' | 'generated-family';

export type StorageBackupPolicy = 'default' | 'optional' | 'never';

export type StorageKeyDescriptor = {
  backup: StorageBackupPolicy;
  key: QuestShelfStorageKey;
  /** The module that owns the value. One owner per key. */
  owner: string;
  purpose: string;
  scope: StorageKeyScope;
  schema: string;
  /** Defaults to 'kv': the localStorage + Capacitor Preferences path. */
  store?: StorageKeyStore;
  /**
   * Copied out of Capacitor Preferences into localStorage before React boots. Only true for values
   * that are actually WRITTEN through the KV path — a plain `localStorage.setItem` never reaches
   * Preferences, so hydrating it would find nothing.
   */
  hydrateOnBoot: boolean;
  reset: StorageResetPolicy;
  /** Credentials or personal content. May never be backed up by default (see the registry tests). */
  sensitive: boolean;
};

/**
 * A generated key FAMILY: one policy covering every key that starts with `prefix`. Reset cleans a
 * family by scanning the local keys for that prefix — which is why a family must be registered
 * before its keys can be swept, and why reset never deletes `questshelf.*` blindly.
 */
export type StorageKeyFamilyDescriptor = {
  prefix: string;
  owner: string;
  purpose: string;
  scope: StorageKeyScope;
  store: StorageKeyStore;
  backup: StorageBackupPolicy;
  hydrateOnBoot: false;
  reset: 'remove' | 'preserve';
  sensitive: boolean;
};

export const storageKeyRegistry: StorageKeyDescriptor[] = [
  {
    backup: 'default',
    key: 'questshelf.achievementCounters.v1',
    purpose: 'Event-based achievement counters: active days, session opens, Quest Runner stats, backup events, playing streak.',
    scope: 'core',
    schema: 'AchievementCounters.',
    owner: 'achievementCounters.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'default',
    key: 'questshelf.games.v1',
    purpose: 'Library and Wishlist game records. Wave 3: stored in the IndexedDB game store; this blob is a read-only import fallback kept inert (not mirrored to Preferences). Still the backup export/import shape.',
    scope: 'core',
    schema: 'Game[] normalized by gameStorage.',
    store: 'collection',
    owner: 'gameStorage.ts / gameRepository.ts',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: true,
  },
  {
    backup: 'default',
    key: 'questshelf.rawgMetadataCache.v1',
    purpose: 'Local RAWG search/detail cache. Wave 4: stored per-record in the IndexedDB rawgMetadataCache store; this blob is a read-only import fallback kept inert (not mirrored to Preferences). Still the backup export/import shape. Cache-like, but deliberately scoped as core: it is part of the EXISTING backup contract and this PR does not change what a backup contains.',
    scope: 'core',
    schema: 'Record<string, RawgMetadataCacheEntry>.',
    store: 'collection',
    owner: 'rawgMetadataCacheRepository.ts',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },

  {
    backup: 'never',
    key: 'questshelf.screenshots.v1',
    purpose: 'RAWG screenshot URL cache. Stored in IndexedDB appCaches; legacy localStorage blobs are migrated and removed.',
    scope: 'cache',
    schema: 'Record<string, { urls: string[]; provider: string; cachedAt: number }>.',
    store: 'collection',
    owner: 'screenshotCache.ts',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.personalRecommendations.v2',
    purpose: 'Personal discovery recommendation cache. Stored in IndexedDB appCaches; legacy localStorage blobs are migrated and removed.',
    scope: 'cache',
    schema: 'Recommendation cache entry keyed by profile fingerprint.',
    store: 'collection',
    owner: 'personalRecommendationsService.ts',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.discoveryInbox.v1',
    purpose: 'Generated Discovery Inbox active and deferred candidate queues. Disposable generated state; not exported in backups.',
    scope: 'cache',
    schema: 'DiscoveryInboxState normalized by discoveryInboxStorage.',
    owner: 'discoveryInboxStorage.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'default',
    key: 'questshelf.recommendationFeedback.v1',
    purpose: 'User recommendation feedback such as exact hides, already played, and bounded preference signals.',
    scope: 'core',
    schema: 'RecommendationFeedbackRecord[] normalized by recommendationFeedback.',
    owner: 'recommendationFeedback.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: true,
  },
  {
    backup: 'never',
    key: 'questshelf.recommendationExposure.v1',
    purpose: 'Disposable recommendation exposure/fatigue counters.',
    scope: 'cache',
    schema: 'RecommendationExposureRecord[] normalized by recommendationFeedback.',
    owner: 'recommendationFeedback.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'default',
    key: 'questshelf.recommendationPreferences.v1',
    purpose: 'Small user-facing recommendation controls such as exploration mode and fatigue/variety preferences.',
    scope: 'core',
    schema: 'RecommendationPreferences normalized by recommendationFeedback.',
    owner: 'recommendationFeedback.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'default',
    key: 'questshelf.tasteProfile.v1',
    purpose: 'Canonical Taste Profile with observed, explicit, and temporary preference layers.',
    scope: 'core',
    schema: 'TasteProfile normalized by tasteProfile.',
    owner: 'tasteProfile.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: true,
  },
  {
    backup: 'never',
    key: 'questshelf.releaseCalendar.v2',
    purpose: 'Personalized release calendar cache. Stored in IndexedDB appCaches; legacy localStorage blobs are migrated and removed.',
    scope: 'cache',
    schema: 'Release calendar cache entry keyed by profile fingerprint/date range.',
    store: 'collection',
    owner: 'releaseCalendarService.ts',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'default',
    key: 'questshelf.steamIgnoredGames.v1',
    purpose: 'Steam App IDs intentionally skipped during import/sync.',
    scope: 'core',
    schema: 'IgnoredSteamGame[].',
    owner: 'steamIgnoredGamesStorage.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'default',
    key: 'questshelf.libraryFilters.v1',
    purpose: 'Last Library filter/sort state.',
    scope: 'core',
    schema: 'CollectionFilters object.',
    owner: 'useCollectionUiState.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'default',
    key: 'questshelf.wishlistFilters.v1',
    purpose: 'Last Wishlist filter/sort state.',
    scope: 'core',
    schema: 'CollectionFilters object.',
    owner: 'useCollectionUiState.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'default',
    key: 'questshelf.onboarding.v1',
    purpose: 'First-run setup progress.',
    scope: 'core',
    schema: 'OnboardingState.',
    owner: 'onboardingStorage.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'default',
    key: 'questshelf.platformQueues.v1',
    purpose: 'Active platforms, platform plan entries, and per-platform limits.',
    scope: 'core',
    schema: 'PlatformQueueState.',
    owner: 'platformQueueStorage.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },

  {
    backup: 'default',
    key: 'questshelf.playActivity.v1',
    purpose: 'Daily play intent activity records for games marked as played today. Wave 4b: stored per-record in the IndexedDB playActivity store; this blob is a read-only import fallback kept inert (not mirrored to Preferences). Still the backup export/import shape.',
    scope: 'core',
    schema: 'PlayActivityRecord[] normalized by playActivityStorage.',
    store: 'collection',
    owner: 'playActivityStorage.ts',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: true,
  },
  {
    backup: 'default',
    key: 'questshelf.reviewMode.v1',
    purpose: 'Quest Queue ignored IDs, source, and stats.',
    scope: 'core',
    schema: 'ReviewModeState.',
    owner: 'reviewModeStorage.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'optional',
    key: 'questshelf.rawgSettings.v1',
    purpose: 'RAWG API key.',
    scope: 'integration',
    schema: 'RawgSettings.',
    owner: 'rawgSettingsStorage.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: true,
  },
  {
    backup: 'optional',
    key: 'questshelf.steamGridDbSettings.v1',
    purpose: 'SteamGridDB API key.',
    scope: 'integration',
    schema: 'SteamGridDbSettings.',
    owner: 'steamGridDbSettingsStorage.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: true,
  },
  {
    backup: 'optional',
    key: 'questshelf.isThereAnyDealSettings.v1',
    purpose: 'IsThereAnyDeal API key.',
    scope: 'integration',
    schema: 'IsThereAnyDealSettings.',
    owner: 'isThereAnyDealSettingsStorage.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: true,
  },
  {
    backup: 'optional',
    key: 'questshelf.steamSettings.v1',
    purpose: 'Steam API key, SteamID64, and optional wishlist URL.',
    scope: 'integration',
    schema: 'SteamSettings.',
    owner: 'steamSettingsStorage.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: true,
  },
  {
    backup: 'never',
    key: 'questshelf.syncFolderSettings.v1',
    purpose: 'Device-specific auto-backup settings.',
    scope: 'device',
    schema: 'SyncFolderSettings.',
    owner: 'syncFolderStorage.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.installHintDismissed.v1',
    purpose: 'PWA install hint dismissal.',
    scope: 'ui',
    schema: 'String boolean.',
    owner: 'PwaStatusBanner.tsx',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.landscapeLock.v1',
    purpose: 'Preferred Android landscape lock setting.',
    scope: 'device',
    schema: 'String boolean.',
    owner: 'landscapePreference.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.settingsCategory.v1',
    purpose: 'Last opened Settings category.',
    scope: 'ui',
    schema: 'Settings category string.',
    owner: 'useAppNavigation.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.themePreference.v1',
    purpose: 'Light, Dark, or System appearance preference.',
    scope: 'ui',
    schema: '\'light\' | \'dark\' | \'system\'.',
    owner: 'themePreferences.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.accentColor.v1',
    purpose: 'Custom app-wide primary accent color preference.',
    scope: 'ui',
    schema: 'Lowercase #rrggbb string or empty for default.',
    owner: 'themePreferences.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.secondaryAccentColor.v1',
    purpose: 'Custom Neon secondary accent color preference.',
    scope: 'ui',
    schema: 'Lowercase #rrggbb string or empty for default.',
    owner: 'themePreferences.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.neonButtonGradientBalance.v1',
    purpose: 'Custom Neon CTA/button gradient primary-secondary balance.',
    scope: 'ui',
    schema: 'Integer 0-100, default 50 when absent.',
    owner: 'themePreferences.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.neonButtonGradientMidpoint.v1',
    purpose: 'Custom Neon CTA/button gradient transition midpoint/spread.',
    scope: 'ui',
    schema: 'Integer 0-100, default 50 when absent.',
    owner: 'themePreferences.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.gradientOrientation.v1',
    purpose: 'Custom primary-secondary accent gradient orientation.',
    scope: 'ui',
    schema: '\'horizontal\' | \'vertical\' | \'diagonal-down\' | \'diagonal-up\', default diagonal-down when absent.',
    owner: 'themePreferences.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.appTemplate.v1',
    purpose: 'Selected visual app template.',
    scope: 'ui',
    schema: '\'classic\' | \'neon-deck\'.',
    owner: 'themePreferences.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'default',
    key: 'questshelf.appPersonalization.v1',
    purpose: 'Library owner nickname used for personalized app titles.',
    scope: 'ui',
    schema: 'AppPersonalizationSettings.',
    owner: 'appPersonalization.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: true,
  },
  {
    backup: 'default',
    key: 'questshelf.shelfIdentity.v1',
    purpose: 'Shelf Identity personalization fields for shelf name and avatar selection.',
    scope: 'core',
    schema: 'ShelfIdentitySettings with shelfName, shelfAvatar, avatarSelection, customAvatarDataUrl, and selectedActiveBadgeId only; unlocked badges.',
    owner: 'shelfIdentity.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: true,
  },
  {
    backup: 'never',
    key: 'questshelf.languagePreference.v1',
    purpose: 'Selected app language.',
    scope: 'ui',
    schema: '\'en\' | \'cs\'.',
    owner: 'languagePreference.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.navigationVisibility.v1',
    purpose: 'Top navigation section visibility preferences.',
    scope: 'ui',
    schema: 'Record of configurable navigation section IDs to booleans.',
    owner: 'navigationVisibilityPreferences.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.homeWidgets.v1',
    purpose: 'Home screen widget visibility preferences.',
    scope: 'ui',
    schema: 'Record of configurable Home widget IDs to booleans.',
    owner: 'homeWidgetPreferences.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.analyticsSettings.v1',
    purpose: 'Local anonymous analytics opt-in/out and notice settings.',
    scope: 'device',
    schema: 'AnalyticsSettings.',
    owner: 'analytics/settings.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.storageIssues.v1',
    purpose: 'Best-effort record of storage parse/write issues for recovery UI.',
    scope: 'recovery',
    schema: 'LocalStorageIssue[].',
    owner: 'localPersistence.ts',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },

  // ── AS-18: keys that were active but unregistered until this PR ────────────────────────────────
  {
    backup: 'never',
    key: 'questshelf.controllerSettings.v1',
    owner: 'controllerSettingsStorage.ts',
    purpose: 'Gamepad layout, deadzone and shortcut settings for this device. Written through the KV path, so it IS mirrored to Preferences — and until now it was not hydrated on native boot, which is the concrete AS-18 defect.',
    scope: 'device',
    schema: 'ControllerSettings (absorbs the legacy questshelf.controllerLayout.v1 blob on read).',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.controllerDebug.v1',
    owner: 'androidGamepadShortcuts.ts',
    purpose: 'Controller input debug overlay toggle.',
    scope: 'device',
    schema: "String boolean.",
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.telemetryDebug.v1',
    owner: 'analytics/client.ts',
    purpose: 'Telemetry debug logging toggle, set by the ?qsTelemetryDebug=1 query flag.',
    scope: 'device',
    schema: "String boolean.",
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.neonButtonStyle.v1',
    owner: 'themePreferences.ts',
    purpose: 'Neon template button style.',
    scope: 'ui',
    schema: 'NeonButtonStyle string.',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.tasteProfile.dragHintSeen.v1',
    owner: 'TasteProfilePanel.tsx',
    purpose: 'Whether the Taste Profile drag hint has been dismissed.',
    scope: 'ui',
    schema: "'seen' or absent.",
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.hltbCache.v1',
    owner: 'hltb.ts',
    purpose: 'HowLongToBeat completion-time cache. Disposable: re-fetched from the provider on demand.',
    scope: 'cache',
    schema: 'Record<string, HltbCacheEntry>.',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.dailyQuest.sessions.v1',
    owner: 'features/dailyQuest/storage.ts',
    purpose: 'Daily Quest play history for this device. Not part of the backup contract today (see the registry tests): it is device-local play state, and adding it to backups would change the export shape.',
    scope: 'core',
    schema: 'DailyQuestSession[].',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.achievementQuiz.sessions.v1',
    owner: 'features/achievementQuiz/storage.ts',
    purpose: 'Achievement Quiz history for this device. Device-local play state; not in the backup contract today.',
    scope: 'core',
    schema: 'QuizSession[].',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.achievementQuiz.selectedGames.v1',
    owner: 'features/achievementQuiz/storage.ts',
    purpose: 'Games already used by the Achievement Quiz, so it does not repeat them.',
    scope: 'core',
    schema: 'Recently used game id log.',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.questRunner.hs.v1',
    owner: 'QuestRunnerGame.tsx',
    purpose: 'Quest Runner high score for this device. The achievement counters that DO get backed up are separate.',
    scope: 'core',
    schema: 'Integer score as a string.',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.releaseCalendarIgnoredRawgIds.v1',
    owner: 'releaseCalendarService.ts',
    purpose: 'Release calendar entries the user hid. Generated discovery state, cleared with the other recommendation caches on restore and reset.',
    scope: 'cache',
    schema: 'number[] of RAWG ids.',
    hydrateOnBoot: true,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf:retro-import:last-android-folder-uri',
    owner: 'RetroImportPanel.tsx',
    purpose: 'Last Android SAF folder URI used by the Retro import, so the picker reopens where the user left it. Device-local by nature: the URI is meaningless on another device.',
    scope: 'device',
    schema: 'content:// URI string.',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'qs-home-progress-v1',
    owner: 'HomePanel.tsx',
    purpose: 'Dismissed Home progress panel. Restored by Settings → Hints.',
    scope: 'ui',
    schema: 'Dismissal flag.',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'qs-workflow-strip-v1',
    owner: 'HomePanel.tsx',
    purpose: 'Dismissed Home workflow strip. Restored by Settings → Hints.',
    scope: 'ui',
    schema: 'Dismissal flag.',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'qs-queue-hint-v1',
    owner: 'QueuePanel.tsx',
    purpose: 'Dismissed Quest Queue hint. Restored by Settings → Hints.',
    scope: 'ui',
    schema: 'Dismissal flag.',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'qs-review-hint-v1',
    owner: 'ReviewModePanel.tsx',
    purpose: 'Dismissed Review mode hint. Restored by Settings → Hints.',
    scope: 'ui',
    schema: 'Dismissal flag.',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'qs-hero-recent-eggs',
    owner: 'HomePanel.tsx',
    purpose: 'Recently shown Home hero easter eggs, so the same one does not repeat. Found by the AS-18 coverage scan; the audit had not listed it.',
    scope: 'ui',
    schema: 'Easter egg id list (max 5).',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'qs-queue-ghost-unlocked-achievements-v1',
    owner: 'achievementGhostStorage.ts',
    purpose: 'Achievements whose Queue Ghost celebration has already been shown.',
    scope: 'ui',
    schema: 'Achievement id list.',
    store: 'local',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.pendingUndoActions.v2',
    owner: 'undoHistoryStorage.ts',
    purpose: 'Undo actions still offered in this browser session. Session-scoped by design — an undo must not outlive the session it belongs to. (The v1 key is a legacy input that is only ever removed.)',
    scope: 'session',
    schema: 'UndoActionHistoryEntry[].',
    store: 'session',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'qs-ghost-v1',
    owner: 'QueueGhost.tsx',
    purpose: 'Whether the Queue Ghost appears in this session.',
    scope: 'session',
    schema: "'1' | '0'.",
    store: 'session',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questshelf.syncFolder.v1',
    owner: 'syncFolderStorage.ts',
    purpose: 'IndexedDB database holding the granted auto-backup folder handle. A device permission, not user data: it is preserved by a reset, because a reset does not revoke a folder grant the user made to this device.',
    scope: 'device',
    schema: 'Dexie database with the stored FileSystemDirectoryHandle.',
    store: 'collection',
    hydrateOnBoot: false,
    reset: 'preserve',
    sensitive: false,
  },
  {
    backup: 'never',
    key: 'questory.preRestoreSnapshot.v1',
    owner: 'recoverySnapshotStorage.ts',
    purpose: 'Full export taken immediately BEFORE a destructive restore, so a restore that goes wrong can be undone (AS-01). Lives in the IndexedDB appCaches table because a full library exceeds the localStorage quota.',
    scope: 'recovery',
    schema: 'RecoverySnapshot { exportedAt, backup }.',
    store: 'collection',
    hydrateOnBoot: false,
    // A reset must not destroy the evidence that makes a bad restore reversible. This is the one
    // entry Reset Local Data deliberately leaves alone.
    reset: 'preserve',
    sensitive: true,
  },
];

/**
 * Generated key families. Reset sweeps these by prefix — which is exactly why the prefix has to be
 * registered: reset never deletes `questshelf.*` wholesale, it deletes what the registry describes.
 */
export const storageKeyFamilyRegistry: StorageKeyFamilyDescriptor[] = [
  {
    prefix: 'questshelf.collectionViewMode.v1',
    owner: 'useCollectionUiState.ts',
    purpose: 'Grid/shelf/compact view mode, one key per collection (library, wishlist).',
    scope: 'ui',
    store: 'local',
    backup: 'never',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
  {
    prefix: 'qs-sgdb-artwork:',
    owner: 'steamGridDbArtwork.ts',
    purpose: 'SteamGridDB artwork lookup cache, one key per game. Disposable: re-fetched on demand.',
    scope: 'cache',
    store: 'local',
    backup: 'never',
    hydrateOnBoot: false,
    reset: 'remove',
    sensitive: false,
  },
];

export const coreBackupStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.backup === 'default')
  .map((descriptor) => descriptor.key);

export const integrationBackupStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.backup === 'optional')
  .map((descriptor) => descriptor.key);

export const deviceOnlyStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.backup === 'never')
  .map((descriptor) => descriptor.key);

/**
 * AS-18: boot hydration is derived from the registry rather than from "everything that is not a
 * collection".
 *
 * `hydrateOnBoot` marks the values that take part in the KV path — the ones Capacitor Preferences
 * can hold, whether written by `savePersistedJson` today or by a backup restore. Every KV entry
 * keeps hydrating exactly as it did before this PR; what changed is that `questshelf.controllerSettings.v1`
 * is finally among them (it is written through Preferences and was never hydrated back on native
 * boot, which is the concrete defect AS-18 describes).
 *
 * `store: 'local' | 'session' | 'collection'` values are NOT hydrated: a plain `localStorage.setItem`
 * never reaches Preferences, a session value must not survive its session, and IndexedDB data must
 * not round-trip through the KV store.
 */
export const persistentStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.hydrateOnBoot)
  .map((descriptor) => descriptor.key);

/** KV keys Reset Local Data removes (localStorage + the durable Preferences mirror). */
export const resettableKvStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.reset === 'remove' && (descriptor.store ?? 'kv') === 'kv')
  .map((descriptor) => descriptor.key);

/** Browser-local keys Reset removes. They have no Preferences mirror to clear. */
export const resettableLocalStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.reset === 'remove' && descriptor.store === 'local')
  .map((descriptor) => descriptor.key);

/** sessionStorage keys Reset removes. */
export const resettableSessionStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.reset === 'remove' && descriptor.store === 'session')
  .map((descriptor) => descriptor.key);

/** IndexedDB-backed keys Reset removes. Their stores are cleared by their own repositories. */
export const resettableCollectionStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.reset === 'remove' && descriptor.store === 'collection')
  .map((descriptor) => descriptor.key);

/** Values a reset deliberately keeps — today, only the pre-restore recovery snapshot. */
export const preservedStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.reset === 'preserve')
  .map((descriptor) => descriptor.key);

/** Prefixes Reset may sweep. A prefix that is not here is not swept, whatever it starts with. */
export const resettableStorageKeyPrefixes = storageKeyFamilyRegistry
  .filter((family) => family.reset === 'remove')
  .map((family) => family.prefix);

export function findStorageKeyFamily(key: string): StorageKeyFamilyDescriptor | undefined {
  return storageKeyFamilyRegistry.find((family) => key.startsWith(family.prefix));
}

export function isRegisteredStorageKey(key: string): boolean {
  return storageKeyRegistry.some((descriptor) => descriptor.key === key) || findStorageKeyFamily(key) !== undefined;
}
