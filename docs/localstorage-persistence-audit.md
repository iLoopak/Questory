# localStorage Persistence Audit

Questory uses IndexedDB as the primary store for growing application data. This audit covers direct `localStorage.getItem`, `setItem`, `removeItem`, and `clear` usage plus wrapper utilities (`storageAdapter`, `localPersistence`, and feature storage modules).

| Key / key family | Data stored | Why stored | Class | Duplicates IndexedDB? | Active? | Expected size | Decision |
|---|---|---:|---|---|---|---:|---|
| `questshelf.games.v1` | Full library/wishlist `Game[]` legacy blob | Migration/backup compatibility | Primary app data (legacy) | Yes, `games` store | Read-only fallback | Large, grows with library | Keep inert legacy fallback; IndexedDB is source of truth |
| `questshelf.rawgMetadataCache.v1` | RAWG metadata cache entries | API cache | Cache | Yes, `rawgMetadataCache` store | Read-only fallback | Large, grows with lookup volume | Keep inert legacy fallback; IndexedDB is source of truth |
| `questshelf.playActivity.v1` | Daily play records | Activity history | Primary app data | Yes, `playActivity` store | Read-only fallback | Grows over time | Keep inert legacy fallback; IndexedDB is source of truth |
| `questshelf.screenshots.v1` | RAWG screenshot URL cache by RAWG ID/title | Avoid repeated screenshot fetches | Cache | Now yes, `appCaches` store | Yes | Medium/large, grows with viewed games | Moved to IndexedDB; legacy blob migrates then removes |
| `questshelf.personalRecommendations.v1` | Discovery recommendation candidates with mapped game metadata | 24h recommendation cache | Cache | Now yes, `appCaches` store | Yes | Medium, profile-dependent | Moved to IndexedDB; legacy blob migrates then removes |
| `questshelf.releaseCalendar.v2` | Personalized release calendar candidates | 24h release-calendar cache | Cache | Now yes, `appCaches` store | Yes | Medium, may grow with calendar candidate metadata | Moved to IndexedDB; legacy blob migrates then removes |
| `questshelf.releaseCalendarIgnoredRawgIds.v1` | Ignored release RAWG IDs | Hide dismissed releases | User preference/list | No | Yes | Small to medium ID list | Acceptable for now; consider IndexedDB only if it becomes large |
| `qs-sgdb-artwork:*` | One SteamGridDB artwork response per game/title | Artwork lookup cache | Cache | No | Yes | Medium, one key per lookup | Candidate for future IndexedDB migration |
| `questshelf.platformQueues.v1` | Platform plans, active platforms, limits | Queue/planning state | Primary app data | No | Yes | Medium, grows with planned platforms/entries | Candidate for IndexedDB if platform entries become large |
| `questshelf.reviewMode.v1` | Quest Queue ignored IDs/source/stats | Queue state and preferences | Mixed | No | Yes | Small/medium ID lists | Acceptable; migrate if ignored IDs grow significantly |
| `questshelf.discoveryInbox.v1` | Discovery inbox data via wrapper | User-curated discovery list | Primary app data | No | Yes | Can grow | Candidate for IndexedDB follow-up |
| `questshelf.steamIgnoredGames.v1` | Ignored Steam app IDs | Import preference/list | User preference/list | No | Yes | Small/medium | Acceptable |
| `questshelf.achievementQuiz.sessions.v1` | Achievement quiz session history | Feature history | Primary/feature data | No | Yes | Small/medium | Acceptable unless history is expanded |
| `questshelf.achievementQuiz.selectedGames.v1` | Achievement quiz selected game IDs/log | Feature state | User preference/list | No | Yes | Small | Keep localStorage |
| `questshelf.dailyQuest.sessions.v1` | Daily quest session history | Feature history | Primary/feature data | No | Yes | Small/medium | Acceptable unless unbounded history expands |
| `questshelf.hltbCache.v1` | HowLongToBeat cache | API cache | Cache | No | Yes | Medium, grows with enriched games | Candidate for future IndexedDB migration |
| `questshelf.rawgSettings.v1`, `questshelf.steamSettings.v1`, `questshelf.steamGridDbSettings.v1`, `questshelf.isThereAnyDealSettings.v1` | Integration settings/API keys | User integrations | Settings | No | Yes | Small | Keep localStorage/Preferences |
| `questshelf.syncFolderSettings.v1`, `questshelf:retro-import:last-android-folder-uri` | Device-specific folder settings | Native/device workflows | Device setting | No | Yes | Small | Keep localStorage/Preferences |
| `questshelf.libraryFilters.v1`, `questshelf.wishlistFilters.v1`, `questshelf.settingsCategory.v1`, `questshelf.navigationVisibility.v1`, `questshelf.homeWidgets.v1` | Filters, view modes, nav/widgets/settings UI state | Restore UI | UI preference | No | Yes | Small | Keep localStorage |
| Theme keys: `questshelf.themePreference.v1`, `questshelf.appTemplate.v1`, `questshelf.accentColor.v1`, `questshelf.secondaryAccentColor.v1`, `questshelf.gradientOrientation.v1`, `questshelf.neonButton*` | Appearance preferences | Personalization | UI preference | No | Yes | Tiny | Keep localStorage |
| `questshelf.onboarding.v1`, `questshelf.installHintDismissed.v1`, `qs-*hint*`, `qs-home-progress-v1`, `qs-workflow-strip-v1`, `qs-hero-recent-eggs`, `qs-queue-ghost-unlocked-achievements-v1` | Onboarding/hint/easter-egg dismissal or small recent lists | UI affordances | UI preference | No | Yes | Tiny/small | Keep localStorage |
| `questshelf.analyticsSettings.v1`, `questshelf.telemetryDebug.v1`, `questshelf.controllerDebug.v1`, `questshelf.landscapeLock.v1`, `questshelf.controllerSettings.v1`, `questshelf.languagePreference.v1`, `questshelf.appPersonalization.v1`, `questshelf.shelfIdentity.v1` | Consent, debug, controller, language and profile settings | User/device settings | Preference/settings | No | Yes | Small | Keep localStorage/Preferences |
| `questshelf.questRunner.hs.v1` | Quest Runner high score | Mini-game setting | Feature preference | No | Yes | Tiny | Keep localStorage |
| `questshelf.pendingUndoActions.v1` | Pending undo actions | Session recovery | Recovery | No | Session storage | Small/temporary | Not localStorage |

## Oversized datasets identified

The entries most likely to grow with the user's library or enrichment activity are screenshots, personal recommendations, release calendar candidates, SteamGridDB artwork caches, HLTB cache, platform queues, discovery inbox, and legacy full-game/cache blobs. Screenshots, recommendations, and release calendar data were moved in this change because they are caches that can contain repeated game/artwork metadata and do not need synchronous localStorage reads.

## Migration behavior

The new `appCaches` IndexedDB table stores heavy cache blobs by key. On first read of a migrated key, Questory reads the legacy localStorage/Preferences value, writes it to IndexedDB if no IndexedDB value exists, verifies the write by reading it back, and then removes the obsolete localStorage/Preferences value. The migration is idempotent: existing IndexedDB values win, missing legacy values are ignored, and failures leave the legacy data in place for retry.
