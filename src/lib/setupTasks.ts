import type { SettingsCategory } from '../config/settings';
import type { PlatformQueueState } from './platformQueueStorage';
import type { AccentColorPreference, ThemePreference } from './themePreferences';
import type { Game } from '../types/game';
import type { SteamSettings } from '../types/steam';

export type SetupTaskStatus = 'completed' | 'attention' | 'pending';

export type SetupTaskAction =
  | { type: 'navigate'; category: SettingsCategory }
  | { type: 'sync-achievements' }
  | { type: 'add-game' };

export interface SetupTask {
  id: string;
  title: string;
  description: string;
  status: SetupTaskStatus;
  actionLabel: string;
  action: SetupTaskAction;
}

export interface SetupProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface SetupTaskContext {
  accentColorPreference: AccentColorPreference;
  games: Game[];
  isRawgApiKeySet: boolean;
  platformQueueState: PlatformQueueState;
  steamSettings: SteamSettings;
  themePreference: ThemePreference;
}

export function buildSetupTasks(ctx: SetupTaskContext): SetupTask[] {
  const hasSteamApiKey = ctx.steamSettings.apiKey.trim() !== '';
  const hasSteamId = ctx.steamSettings.steamId64.trim() !== '';
  const hasSteamLibrary = ctx.games.some(
    (g) => g.collectionType === 'library' && g.externalSource === 'steam',
  );
  const steamLibraryGames = ctx.games.filter(
    (g) => g.collectionType === 'library' && typeof g.steamAppId === 'number',
  );
  const unsyncedCount = steamLibraryGames.filter(
    (g) => !Array.isArray(g.steamAchievements) && g.steamAchievementsUnsupported !== true,
  ).length;
  const hasRetroGames = ctx.games.some(
    (g) => g.externalSource === 'retro-rom' || Boolean(g.romPath || g.romFiles?.length),
  );
  const themeCustomized =
    ctx.accentColorPreference !== null || ctx.themePreference !== 'system';
  const hasActivePlatforms = ctx.platformQueueState.activePlatforms.length > 0;

  const tasks: SetupTask[] = [
    {
      id: 'steam-connected',
      title: 'Steam connected',
      description: hasSteamApiKey && hasSteamId
        ? 'Your Steam API key and ID are configured.'
        : hasSteamApiKey
          ? 'API key saved — add your Steam ID to complete setup.'
          : 'Connect Steam to import your library and achievements.',
      status:
        hasSteamApiKey && hasSteamId ? 'completed' :
        hasSteamApiKey || hasSteamId ? 'attention' :
        'pending',
      actionLabel: 'Configure',
      action: { type: 'navigate', category: 'Integrations' },
    },
    {
      id: 'steam-library-imported',
      title: 'Steam library imported',
      description: hasSteamLibrary
        ? 'Your Steam games are in Questory.'
        : 'Import your Steam library to see all your games here.',
      status:
        hasSteamLibrary ? 'completed' :
        (hasSteamApiKey && hasSteamId) ? 'attention' :
        'pending',
      actionLabel: 'Import Library',
      action: { type: 'navigate', category: 'Integrations' },
    },
    {
      id: 'steam-achievements-synced',
      title: 'Steam achievements synced',
      description:
        steamLibraryGames.length === 0
          ? 'Import your Steam library first, then sync achievement history.'
          : unsyncedCount === 0
            ? 'All Steam games have full achievement history.'
            : `${unsyncedCount} game${unsyncedCount !== 1 ? 's' : ''} still missing achievement data.`,
      status:
        steamLibraryGames.length === 0 ? 'pending' :
        unsyncedCount === 0 ? 'completed' :
        'attention',
      actionLabel: 'Sync History',
      action: { type: 'sync-achievements' },
    },
    {
      id: 'rawg-api-configured',
      title: 'RAWG API configured',
      description: ctx.isRawgApiKeySet
        ? 'Rich game metadata and cover art are enabled.'
        : 'Unlock richer game metadata, cover art, and release information.',
      status: ctx.isRawgApiKeySet ? 'completed' : 'pending',
      actionLabel: 'Configure',
      action: { type: 'navigate', category: 'Integrations' },
    },
    {
      id: 'retro-configured',
      title: 'Retro ROM folders configured',
      description: hasRetroGames
        ? 'Retro games are part of your library.'
        : 'Import ROM folders to track your retro game collection.',
      status: hasRetroGames ? 'completed' : 'pending',
      actionLabel: 'Import ROMs',
      action: { type: 'navigate', category: 'Retro' },
    },
    {
      id: 'theme-customized',
      title: 'Theme customized',
      description: themeCustomized
        ? 'Questory looks like yours.'
        : 'Choose your accent color, theme mode, and visual style.',
      status: themeCustomized ? 'completed' : 'pending',
      actionLabel: 'Customize',
      action: { type: 'navigate', category: 'Appearance' },
    },
    {
      id: 'platform-plans-created',
      title: 'Platform plans created',
      description: hasActivePlatforms
        ? 'Your platform backlog is organized.'
        : 'Set up platform queues to organize your backlog by system.',
      status: hasActivePlatforms ? 'completed' : 'pending',
      actionLabel: 'Configure',
      action: { type: 'navigate', category: 'Platforms' },
    },
  ];

  // Only show "add first manual game" for users who don't rely on Steam import.
  const hasSteamOrRetroGames = hasSteamLibrary || hasRetroGames;
  if (!hasSteamOrRetroGames) {
    const hasManualGame = ctx.games.some((g) => g.externalSource === 'manual');
    tasks.push({
      id: 'first-manual-game',
      title: 'First game added',
      description: hasManualGame
        ? 'You have games in your library.'
        : 'Add your first game to start tracking your collection.',
      status: hasManualGame ? 'completed' : 'pending',
      actionLabel: 'Add Game',
      action: { type: 'add-game' },
    });
  }

  return tasks;
}

export function getSetupProgress(tasks: SetupTask[]): SetupProgress {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const total = tasks.length;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 100,
  };
}
