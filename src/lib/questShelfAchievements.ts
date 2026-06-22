import type { PlatformQueueState } from './platformQueueStorage';
import type { IconName } from '../components/Icon';
import type { Game } from '../types/game';
import type { AchievementCounters } from './achievementCounters';
import type { ReviewStats } from './reviewModeStorage';

// ─── IDs ─────────────────────────────────────────────────────────────────────

export type QuestShelfAchievementId =
  // Existing
  | 'steam-veteran'
  | 'completionist'
  | 'collector'
  | 'retro-explorer'
  | 'achievement-hunter'
  | 'backlog-slayer'
  | 'curator'
  | 'platform-hopper'
  | 'handheld-hero'
  | 'playing-right-now'
  | 'metadata-master'
  | 'art-conservator'
  | 'queue-commander'
  | 'century-club'
  // Onboarding
  | 'the-journey-begins'
  // Library
  | 'shelf-builder'
  | 'library-curator'
  | 'archivist'
  | 'dragons-hoard'
  | 'one-more-game'
  // Playing / Finished
  | 'first-blood'
  | 'focused-gamer'
  | 'completionist-ten'
  | 'legendary-hero'
  | 'backlog-slayer-burst'
  // Quest Queue
  | 'decision-maker'
  | 'judge-jury-executioner'
  | 'backlog-assassin'
  | 'no-mercy'
  | 'maybe-later'
  // Platforms / Retro
  | 'monogamist'
  | 'platform-loyalist'
  | 'jack-of-all-trades'
  | 'retro-veteran'
  | 'retro-collector'
  // Integrations
  | 'steam-initiate'
  | 'achievement-hunter-qs'
  | 'data-archaeologist'
  | 'safe-keeper'
  | 'phoenix'
  // Usage / Fun
  | 'dedicated-adventurer'
  | 'night-owl'
  | 'early-bird'
  | 'just-browsing'
  | 'one-does-not-simply'
  // Quest Runner
  | 'first-run'
  | 'getting-the-hang'
  | 'speedrunner-qs'
  | 'unstoppable'
  | 'backlog-dodger'
  | 'just-one-more-run'
  // Meta
  | 'alpha-tester'
  | 'day-one-player'
  | 'quest-master';

// ─── Context ─────────────────────────────────────────────────────────────────

export type AchievementContext = {
  language?: string;
  counters?: AchievementCounters;
  onboardingCompleted?: boolean;
  reviewStats?: ReviewStats;
  reviewedGamesCount?: number;
};

// ─── Types ───────────────────────────────────────────────────────────────────

export type QuestShelfAchievement = {
  id: QuestShelfAchievementId;
  title: string;
  titleCs?: string;
  icon: IconName;
  description: string;
  descriptionCs?: string;
  unlockCondition: string;
  priority: number;
  colorVariant: 'primary' | 'secondary' | 'mixed' | 'success';
  target?: number;
  isMeta?: boolean;
  getProgress: (games: Game[], queueState?: PlatformQueueState, ctx?: AchievementContext) => number;
};

export type QuestShelfAchievementProgress = QuestShelfAchievement & {
  current: number;
  isUnlocked: boolean;
  progressLabel: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const ALPHA_CUTOFF_DATE = '2026-12-31';
const QUESTSHELF_FIRST_YEAR_END = '2026-01-01';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isRetroPlatform(platform: Game['platform']) {
  return ['PSP', 'PS2', 'PS1', 'PS Vita', 'Game Boy', 'Game Boy Color', 'Game Boy Advance', 'NES', 'SNES', 'Nintendo 64', 'Nintendo DS', 'Wii', 'Wii U', 'GameCube', 'Sega Genesis / Mega Drive', 'Master System', 'Game Gear', 'PC Engine', 'GBA'].includes(String(platform));
}

function hasAssignedArtwork(game: Game) {
  const coverImage = game.coverImage.trim();
  return Boolean(game.artworkSource || game.artworkUpdatedAt || (coverImage && !coverImage.startsWith('data:image/svg+xml')));
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function qqDecisionsCount(stats?: ReviewStats): number {
  if (!stats) return 0;
  return (stats.dropped ?? 0) + (stats.playing ?? 0) + (stats.wishlisted ?? 0) + (stats.queueCandidates ?? 0) + (stats.ignored ?? 0) + (stats.enriched ?? 0);
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const questShelfAchievementRegistry: QuestShelfAchievement[] = [
  // ── Existing achievements ─────────────────────────────────────────────────
  {
    id: 'steam-veteran',
    title: 'Steam Veteran',
    icon: 'steam',
    description: 'Your shelf includes games from Steam.',
    unlockCondition: 'Add at least one Steam game to your Library.',
    priority: 110,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && (game.platform === 'Steam' || game.externalSource === 'steam' || typeof game.steamAppId === 'number')).length,
  },
  {
    id: 'completionist',
    title: 'Completionist',
    icon: 'check-circle',
    description: 'You have finished at least one game.',
    unlockCondition: 'Mark at least one Library game as Finished.',
    priority: 100,
    colorVariant: 'success',
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && game.status === 'Finished').length,
  },
  {
    id: 'collector',
    title: 'Collector',
    icon: 'archive',
    description: 'Your QuestShelf library has grown into a collection.',
    unlockCondition: 'Keep 25 or more games in your Library.',
    priority: 90,
    colorVariant: 'mixed',
    target: 25,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library').length,
  },
  {
    id: 'retro-explorer',
    title: 'Retro Explorer',
    icon: 'joystick',
    description: 'Your shelf includes at least one retro platform.',
    unlockCondition: 'Add a Library game from a retro platform.',
    priority: 80,
    colorVariant: 'secondary',
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && isRetroPlatform(game.platform)).length,
  },
  {
    id: 'achievement-hunter',
    title: 'Achievement Hunter',
    icon: 'trophy',
    description: 'Steam achievement completion is actively tracked.',
    unlockCondition: 'Have at least one Steam game with achievement data.',
    priority: 70,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && (game.steamAchievementsLastCheckedAt || (game.steamAchievementsTotal ?? 0) > 0 || typeof game.steamAchievementsPercent === 'number')).length,
  },
  {
    id: 'backlog-slayer',
    title: 'Backlog Slayer',
    icon: 'sword',
    description: 'Making progress through the queue.',
    unlockCondition: 'Finish or drop 10 games from Quest Queue.',
    priority: 60,
    colorVariant: 'success',
    target: 10,
    getProgress: (games, queueState) => {
      const queuedGameIds = new Set(queueState?.entries.map((entry) => entry.gameId) ?? []);
      return games.filter((game) => game.collectionType === 'library' && (game.status === 'Finished' || game.status === 'Dropped') && (queuedGameIds.has(game.id) || game.finishedAt || game.droppedAt)).length;
    },
  },
  {
    id: 'curator',
    title: 'Curator',
    icon: 'bookmark-pen',
    description: 'A carefully maintained wishlist.',
    unlockCondition: 'Add 25 games to your Wishlist.',
    priority: 50,
    colorVariant: 'secondary',
    target: 25,
    getProgress: (games) => games.filter((game) => game.collectionType === 'wishlist').length,
  },
  {
    id: 'platform-hopper',
    title: 'Platform Hopper',
    icon: 'layers',
    description: 'Gaming across many systems.',
    unlockCondition: 'Add games across at least 5 platforms.',
    priority: 45,
    colorVariant: 'mixed',
    target: 5,
    getProgress: (games) => new Set(games.filter((game) => game.collectionType === 'library').map((game) => String(game.platform).trim()).filter(Boolean)).size,
  },
  {
    id: 'handheld-hero',
    title: 'Handheld Hero',
    icon: 'handheld',
    description: 'Built a significant handheld/retro collection.',
    unlockCondition: 'Add 25 games across retro or handheld platforms.',
    priority: 44,
    colorVariant: 'secondary',
    target: 25,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && isRetroPlatform(game.platform)).length,
  },
  {
    id: 'playing-right-now',
    title: 'Playing Right Now',
    icon: 'play-circle',
    description: 'Actively gaming instead of collecting.',
    unlockCondition: 'Mark at least one Library game as Playing.',
    priority: 43,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && game.status === 'Playing').length,
  },
  {
    id: 'metadata-master',
    title: 'Metadata Master',
    icon: 'database-sparkles',
    description: 'A well-maintained collection.',
    unlockCondition: 'Enrich metadata for 100 Library games.',
    priority: 42,
    colorVariant: 'mixed',
    target: 100,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && (game.metadataSource || game.metadataUpdatedAt || game.rawgId || game.hltbId)).length,
  },
  {
    id: 'art-conservator',
    title: 'Art Conservator',
    icon: 'image-frame',
    description: 'Artwork coverage is under control.',
    unlockCondition: 'Assign artwork to 100 Library games.',
    priority: 41,
    colorVariant: 'secondary',
    target: 100,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && hasAssignedArtwork(game)).length,
  },
  {
    id: 'queue-commander',
    title: 'Queue Commander',
    icon: 'list-ordered',
    description: 'Quest Queue is actively managed.',
    unlockCondition: 'Configure at least 5 queue platforms.',
    priority: 40,
    colorVariant: 'primary',
    target: 5,
    getProgress: (_games, queueState) => queueState?.activePlatforms.length ?? 0,
  },
  {
    id: 'century-club',
    title: 'Century Club',
    icon: 'badge-100',
    description: 'A major collection milestone.',
    unlockCondition: 'Keep 100 games in your Library.',
    priority: 39,
    colorVariant: 'mixed',
    target: 100,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library').length,
  },

  // ── Onboarding ────────────────────────────────────────────────────────────
  {
    id: 'the-journey-begins',
    title: 'The Journey Begins',
    titleCs: 'Cesta začíná',
    icon: 'rocket',
    description: 'Complete the onboarding process.',
    descriptionCs: 'Dokončete úvodní nastavení.',
    unlockCondition: 'Complete all onboarding steps.',
    priority: 185,
    colorVariant: 'primary',
    target: 1,
    getProgress: (_games, _qs, ctx) => (ctx?.onboardingCompleted ? 1 : 0),
  },

  // ── Library ───────────────────────────────────────────────────────────────
  {
    id: 'shelf-builder',
    title: 'Shelf Builder',
    titleCs: 'Stavitel poličky',
    icon: 'library',
    description: 'Your library is taking shape.',
    descriptionCs: 'Vaše knihovna začíná mít tvar.',
    unlockCondition: 'Add 10 games to your Library.',
    priority: 112,
    colorVariant: 'mixed',
    target: 10,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library').length,
  },
  {
    id: 'library-curator',
    title: 'Curator',
    titleCs: 'Kurátor',
    icon: 'archive',
    description: '100 games catalogued.',
    descriptionCs: '100 her v katalogu.',
    unlockCondition: 'Add 100 games to your Library.',
    priority: 165,
    colorVariant: 'mixed',
    target: 100,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library').length,
  },
  {
    id: 'archivist',
    title: 'Archivist',
    titleCs: 'Archivář',
    icon: 'layers',
    description: '500 games. A true archivist.',
    descriptionCs: '500 her. Skutečný archivář.',
    unlockCondition: 'Add 500 games to your Library.',
    priority: 170,
    colorVariant: 'mixed',
    target: 500,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library').length,
  },
  {
    id: 'dragons-hoard',
    title: "Dragon's Hoard",
    titleCs: 'Dračí poklad',
    icon: 'gem',
    description: "1000 games. That's not a library, it's a dragon's hoard.",
    descriptionCs: '1000 her. To není knihovna, to je dračí poklad.',
    unlockCondition: 'Add 1000 games to your Library.',
    priority: 175,
    colorVariant: 'secondary',
    target: 1000,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library').length,
  },
  {
    id: 'one-more-game',
    title: 'One More Game',
    titleCs: 'Ještě jednu hru',
    icon: 'plus-square',
    description: 'Added a game by hand.',
    descriptionCs: 'Ručně přidána hra.',
    unlockCondition: 'Manually add a game to your Library.',
    priority: 38,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library' && g.externalSource === 'manual').length,
  },

  // ── Playing / Finished ────────────────────────────────────────────────────
  {
    id: 'first-blood',
    title: 'First Blood',
    titleCs: 'První krev',
    icon: 'play-circle',
    description: 'You started playing your first game.',
    descriptionCs: 'Začali jste hrát svou první hru.',
    unlockCondition: 'Move your first game to Playing Now.',
    priority: 113,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library' && g.status === 'Playing').length,
  },
  {
    id: 'focused-gamer',
    title: 'Focused Gamer',
    titleCs: 'Soustředěný hráč',
    icon: 'check',
    description: 'You finished your first game.',
    descriptionCs: 'Dokončili jste svou první hru.',
    unlockCondition: 'Mark your first Library game as Finished.',
    priority: 111,
    colorVariant: 'success',
    target: 1,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library' && g.status === 'Finished').length,
  },
  {
    id: 'completionist-ten',
    title: 'Completionist',
    titleCs: 'Kompletista',
    icon: 'check-circle',
    description: '10 games finished. Commitment showing.',
    descriptionCs: '10 her dokončeno. Odhodlání je vidět.',
    unlockCondition: 'Finish 10 Library games.',
    priority: 98,
    colorVariant: 'success',
    target: 10,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library' && g.status === 'Finished').length,
  },
  {
    id: 'legendary-hero',
    title: 'Legendary Hero',
    titleCs: 'Legendární hrdina',
    icon: 'trophy',
    description: '100 games finished. Legendary.',
    descriptionCs: '100 her dokončeno. Legendární.',
    unlockCondition: 'Finish 100 Library games.',
    priority: 180,
    colorVariant: 'success',
    target: 100,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library' && g.status === 'Finished').length,
  },
  {
    id: 'backlog-slayer-burst',
    title: 'Backlog Slayer',
    titleCs: 'Přemožitel backlogu',
    icon: 'flame',
    description: 'Finished 5 games in the last 30 days.',
    descriptionCs: '5 her dokončeno za posledních 30 dní.',
    unlockCondition: 'Finish 5 games within a rolling 30-day window.',
    priority: 118,
    colorVariant: 'success',
    target: 5,
    getProgress: (games) => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return games.filter(
        (g) => g.collectionType === 'library' && g.status === 'Finished' && g.finishedAt && g.finishedAt >= cutoff,
      ).length;
    },
  },

  // ── Quest Queue ───────────────────────────────────────────────────────────
  {
    id: 'decision-maker',
    title: 'Decision Maker',
    titleCs: 'Rozhodčí',
    icon: 'list-ordered',
    description: 'First Quest Queue decision made.',
    descriptionCs: 'První rozhodnutí v Quest Queue.',
    unlockCondition: 'Process your first game in Quest Queue.',
    priority: 37,
    colorVariant: 'primary',
    target: 1,
    getProgress: (_g, _q, ctx) => qqDecisionsCount(ctx?.reviewStats),
  },
  {
    id: 'judge-jury-executioner',
    title: 'Judge, Jury & Executioner',
    titleCs: 'Soudce, porota a kat',
    icon: 'skull-check',
    description: '100 Quest Queue decisions made.',
    descriptionCs: '100 rozhodnutí v Quest Queue.',
    unlockCondition: 'Process 100 Quest Queue entries.',
    priority: 155,
    colorVariant: 'mixed',
    target: 100,
    getProgress: (_g, _q, ctx) => qqDecisionsCount(ctx?.reviewStats),
  },
  {
    id: 'backlog-assassin',
    title: 'Backlog Assassin',
    titleCs: 'Zabiják backlogu',
    icon: 'sword',
    description: 'Every game in your library has been through Quest Queue.',
    descriptionCs: 'Každá hra v knihovně prošla Quest Queue.',
    unlockCondition: 'Review all games in your Library through Quest Queue.',
    priority: 160,
    colorVariant: 'success',
    target: 1,
    getProgress: (games, _q, ctx) => {
      const total = games.filter((g) => g.collectionType === 'library').length;
      if (total === 0) return 0;
      const reviewed = ctx?.reviewedGamesCount ?? 0;
      return reviewed >= total ? 1 : 0;
    },
  },
  {
    id: 'no-mercy',
    title: 'No Mercy',
    titleCs: 'Bez milosti',
    icon: 'trash-2',
    description: 'Dropped 20 games. No regrets.',
    descriptionCs: '20 her zahozeno. Bez lítosti.',
    unlockCondition: 'Drop 20 games.',
    priority: 120,
    colorVariant: 'secondary',
    target: 20,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library' && g.status === 'Dropped').length,
  },
  {
    id: 'maybe-later',
    title: 'Maybe Later',
    titleCs: 'Možná později',
    icon: 'bookmark-pen',
    description: '50 games on your wishlist.',
    descriptionCs: '50 her na seznamu přání.',
    unlockCondition: 'Add 50 games to your Wishlist.',
    priority: 116,
    colorVariant: 'secondary',
    target: 50,
    getProgress: (games) => games.filter((g) => g.collectionType === 'wishlist').length,
  },

  // ── Platforms / Retro ─────────────────────────────────────────────────────
  {
    id: 'monogamist',
    title: 'Monogamist',
    titleCs: 'Věrný jediné',
    icon: 'heart',
    description: 'Been playing the same game for 30 consecutive days.',
    descriptionCs: '30 dní za sebou hraní stejné hry.',
    unlockCondition: 'Play the same game for 30 consecutive days.',
    priority: 145,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games, _q, ctx) => {
      const streak = ctx?.counters?.playingStreak;
      if (!streak) return 0;
      const stillPlaying = games.some((g) => g.id === streak.gameId && g.status === 'Playing');
      if (!stillPlaying) return 0;
      const msElapsed = Date.now() - new Date(streak.since).getTime();
      return msElapsed >= 30 * 24 * 60 * 60 * 1000 ? 1 : 0;
    },
  },
  {
    id: 'platform-loyalist',
    title: 'Platform Loyalist',
    titleCs: 'Věrný platformě',
    icon: 'trophy',
    description: 'Finished 10 games on the same platform.',
    descriptionCs: '10 her dokončeno na stejné platformě.',
    unlockCondition: 'Finish 10 games on the same platform.',
    priority: 140,
    colorVariant: 'mixed',
    target: 10,
    getProgress: (games) => {
      const counts = new Map<string, number>();
      for (const g of games) {
        if (g.collectionType === 'library' && g.status === 'Finished') {
          const p = String(g.platform);
          counts.set(p, (counts.get(p) ?? 0) + 1);
        }
      }
      return counts.size === 0 ? 0 : Math.max(...counts.values());
    },
  },
  {
    id: 'jack-of-all-trades',
    title: 'Jack of All Trades',
    titleCs: 'Od všeho trochu',
    icon: 'layers',
    description: 'Played games on 10 distinct platforms.',
    descriptionCs: 'Hráli jste na 10 různých platformách.',
    unlockCondition: 'Play games on 10 distinct platforms.',
    priority: 135,
    colorVariant: 'mixed',
    target: 10,
    getProgress: (games) =>
      new Set(games.filter((g) => g.collectionType === 'library').map((g) => String(g.platform).trim()).filter(Boolean)).size,
  },
  {
    id: 'retro-veteran',
    title: 'Retro Veteran',
    titleCs: 'Retro veterán',
    icon: 'joystick',
    description: 'First ROM imported.',
    descriptionCs: 'První ROM importován.',
    unlockCondition: 'Import your first ROM.',
    priority: 78,
    colorVariant: 'secondary',
    target: 1,
    getProgress: (games) => games.filter((g) => g.externalSource === 'retro-rom').length,
  },
  {
    id: 'retro-collector',
    title: 'Retro Collector',
    titleCs: 'Retro sběratel',
    icon: 'handheld',
    description: '500 ROMs imported.',
    descriptionCs: '500 ROM importováno.',
    unlockCondition: 'Import 500 ROMs.',
    priority: 130,
    colorVariant: 'secondary',
    target: 500,
    getProgress: (games) => games.filter((g) => g.externalSource === 'retro-rom').length,
  },

  // ── Integrations ──────────────────────────────────────────────────────────
  {
    id: 'steam-initiate',
    title: 'Steam Initiate',
    titleCs: 'Zasvěcenec Steamu',
    icon: 'steam',
    description: 'Steam is connected.',
    descriptionCs: 'Steam je připojen.',
    unlockCondition: 'Successfully connect Steam.',
    priority: 109,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games) =>
      games.filter((g) => g.collectionType === 'library' && (g.externalSource === 'steam' || typeof g.steamAppId === 'number')).length,
  },
  {
    id: 'achievement-hunter-qs',
    title: 'Achievement Hunter',
    titleCs: 'Lovec achievementů',
    icon: 'trophy',
    description: 'Steam achievements synced.',
    descriptionCs: 'Steam achievementy synchronizovány.',
    unlockCondition: 'Perform your first Steam achievement synchronization.',
    priority: 69,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games) =>
      games.filter((g) => g.collectionType === 'library' && ((g.steamAchievementsTotal ?? 0) > 0 || typeof g.steamAchievementsPercent === 'number')).length,
  },
  {
    id: 'data-archaeologist',
    title: 'Data Archaeologist',
    titleCs: 'Datový archeolog',
    icon: 'database-sparkles',
    description: 'Refreshed metadata for a game.',
    descriptionCs: 'Obnovena metadata pro hru.',
    unlockCondition: 'Refresh metadata for a game.',
    priority: 36,
    colorVariant: 'mixed',
    target: 1,
    getProgress: (games) =>
      games.filter((g) => g.collectionType === 'library' && (g.metadataSource || g.rawgId || g.metadataUpdatedAt || g.hltbId)).length,
  },
  {
    id: 'safe-keeper',
    title: 'Safe Keeper',
    titleCs: 'Strážce dat',
    icon: 'lock',
    description: 'First backup exported.',
    descriptionCs: 'První záloha exportována.',
    unlockCondition: 'Export your first backup.',
    priority: 35,
    colorVariant: 'primary',
    target: 1,
    getProgress: (_g, _q, ctx) => (ctx?.counters?.backupExportedEver ? 1 : 0),
  },
  {
    id: 'phoenix',
    title: 'Phoenix',
    titleCs: 'Fénix',
    icon: 'refresh-cw',
    description: 'Backup imported. Rising from the ashes.',
    descriptionCs: 'Záloha importována. Povstání z popela.',
    unlockCondition: 'Successfully import a backup.',
    priority: 34,
    colorVariant: 'mixed',
    target: 1,
    getProgress: (_g, _q, ctx) => (ctx?.counters?.backupImportedEver ? 1 : 0),
  },

  // ── Usage / Fun ───────────────────────────────────────────────────────────
  {
    id: 'dedicated-adventurer',
    title: 'Dedicated Adventurer',
    titleCs: 'Oddaný dobrodruh',
    icon: 'sparkles',
    description: 'Opened QuestShelf on 30 unique days.',
    descriptionCs: 'QuestShelf otevřen celkem 30 různých dní.',
    unlockCondition: 'Open QuestShelf on 30 unique days.',
    priority: 125,
    colorVariant: 'primary',
    target: 30,
    getProgress: (_g, _q, ctx) => ctx?.counters?.activeDays.length ?? 0,
  },
  {
    id: 'night-owl',
    title: 'Night Owl',
    titleCs: 'Noční sova',
    icon: 'eye-off',
    description: 'Opened QuestShelf between midnight and 5 AM.',
    descriptionCs: 'QuestShelf otevřen mezi půlnocí a 5 ráno.',
    unlockCondition: 'Open QuestShelf between 00:00 and 05:00.',
    priority: 33,
    colorVariant: 'secondary',
    target: 1,
    getProgress: (_g, _q, ctx) => (ctx?.counters?.nightOwlUnlocked ? 1 : 0),
  },
  {
    id: 'early-bird',
    title: 'Early Bird',
    titleCs: 'Ranní ptáče',
    icon: 'sparkles',
    description: 'Opened QuestShelf between 5 AM and 6 AM.',
    descriptionCs: 'QuestShelf otevřen mezi 5 a 6 ráno.',
    unlockCondition: 'Open QuestShelf between 05:00 and 06:00.',
    priority: 32,
    colorVariant: 'primary',
    target: 1,
    getProgress: (_g, _q, ctx) => (ctx?.counters?.earlyBirdUnlocked ? 1 : 0),
  },
  {
    id: 'just-browsing',
    title: 'Just Browsing',
    titleCs: 'Jen se rozhlížím',
    icon: 'search',
    description: 'Opened QuestShelf 10 times.',
    descriptionCs: 'QuestShelf otevřen 10×.',
    unlockCondition: 'Open QuestShelf 10 times.',
    priority: 31,
    colorVariant: 'mixed',
    target: 10,
    getProgress: (_g, _q, ctx) => ctx?.counters?.justBrowsingOpens ?? 0,
  },
  {
    id: 'one-does-not-simply',
    title: 'One Does Not Simply Organize Backlogs',
    titleCs: 'Backlog se jen tak neorganizuje',
    icon: 'gem',
    description: 'Over 1000 games in Library. Respect.',
    descriptionCs: 'Přes 1000 her v knihovně. Uznání.',
    unlockCondition: 'Own more than 1000 games.',
    priority: 88,
    colorVariant: 'secondary',
    target: 1001,
    getProgress: (games) => games.filter((g) => g.collectionType === 'library').length,
  },

  // ── Quest Runner ──────────────────────────────────────────────────────────
  {
    id: 'first-run',
    title: 'First Run',
    titleCs: 'První běh',
    icon: 'gamepad-2',
    description: 'Started Quest Runner.',
    descriptionCs: 'Spuštěn Quest Runner.',
    unlockCondition: 'Start Quest Runner once.',
    priority: 30,
    colorVariant: 'primary',
    target: 1,
    getProgress: (_g, _q, ctx) => ctx?.counters?.questRunnerRuns ?? 0,
  },
  {
    id: 'getting-the-hang',
    title: 'Getting the Hang of It',
    titleCs: 'Už mi to jde',
    icon: 'gamepad-2',
    description: 'Reached score 100 in Quest Runner.',
    descriptionCs: 'Dosaženo skóre 100 v Quest Runneru.',
    unlockCondition: 'Reach a score of 100 in Quest Runner.',
    priority: 146,
    colorVariant: 'mixed',
    target: 100,
    getProgress: (_g, _q, ctx) => ctx?.counters?.questRunnerBestScore ?? 0,
  },
  {
    id: 'speedrunner-qs',
    title: 'Speedrunner',
    titleCs: 'Speedrunner',
    icon: 'rocket',
    description: 'Reached score 500 in Quest Runner.',
    descriptionCs: 'Dosaženo skóre 500 v Quest Runneru.',
    unlockCondition: 'Reach a score of 500 in Quest Runner.',
    priority: 148,
    colorVariant: 'mixed',
    target: 500,
    getProgress: (_g, _q, ctx) => ctx?.counters?.questRunnerBestScore ?? 0,
  },
  {
    id: 'unstoppable',
    title: 'Unstoppable',
    titleCs: 'Nezastavitelný',
    icon: 'flame',
    description: 'Reached score 1000 in Quest Runner.',
    descriptionCs: 'Dosaženo skóre 1000 v Quest Runneru.',
    unlockCondition: 'Reach a score of 1000 in Quest Runner.',
    priority: 150,
    colorVariant: 'success',
    target: 1000,
    getProgress: (_g, _q, ctx) => ctx?.counters?.questRunnerBestScore ?? 0,
  },
  {
    id: 'backlog-dodger',
    title: 'Backlog Dodger',
    titleCs: 'Vyhýbač backlogu',
    icon: 'sword',
    description: 'Dodged 100 obstacles in Quest Runner total.',
    descriptionCs: 'Celkem vyhýbáno 100 překážkám v Quest Runneru.',
    unlockCondition: 'Dodge 100 obstacles cumulatively in Quest Runner.',
    priority: 128,
    colorVariant: 'secondary',
    target: 100,
    getProgress: (_g, _q, ctx) => ctx?.counters?.questRunnerObstaclesDodged ?? 0,
  },
  {
    id: 'just-one-more-run',
    title: 'Just One More Run',
    titleCs: 'Ještě jeden pokus',
    icon: 'gamepad-2',
    description: 'Played Quest Runner 10 times.',
    descriptionCs: 'Quest Runner zahrán 10×.',
    unlockCondition: 'Play Quest Runner 10 times.',
    priority: 126,
    colorVariant: 'primary',
    target: 10,
    getProgress: (_g, _q, ctx) => ctx?.counters?.questRunnerRuns ?? 0,
  },

  // ── Meta ──────────────────────────────────────────────────────────────────
  {
    id: 'alpha-tester',
    title: 'QuestShelf Alpha Tester',
    titleCs: 'Alpha tester',
    icon: 'gem',
    description: 'You were here during the alpha. Thank you.',
    descriptionCs: 'Byl(a) jste zde během alphy. Děkujeme.',
    unlockCondition: `Use the app during the alpha period (before ${ALPHA_CUTOFF_DATE}).`,
    priority: 195,
    colorVariant: 'secondary',
    isMeta: true,
    target: 1,
    getProgress: () => (isoDateToday() <= ALPHA_CUTOFF_DATE ? 1 : 0),
  },
  {
    id: 'day-one-player',
    title: 'Day One Player',
    titleCs: 'Hráč od prvního dne',
    icon: 'rocket',
    description: 'Your library was created in the first year of QuestShelf.',
    descriptionCs: 'Vaše knihovna vznikla v prvním roce QuestShelfu.',
    unlockCondition: 'Add your first game during the first year of QuestShelf.',
    priority: 190,
    colorVariant: 'primary',
    isMeta: true,
    target: 1,
    getProgress: (_g, _q, ctx) => {
      const created = ctx?.counters?.libraryFirstCreatedAt;
      if (!created) return 0;
      return created < QUESTSHELF_FIRST_YEAR_END ? 1 : 0;
    },
  },
  {
    id: 'quest-master',
    title: 'Quest Master',
    titleCs: 'Pán výprav',
    icon: 'trophy',
    description: 'All non-meta achievements unlocked.',
    descriptionCs: 'Všechny nemetaachievementy odemčeny.',
    unlockCondition: 'Unlock all non-meta achievements.',
    priority: 200,
    colorVariant: 'success',
    isMeta: true,
    target: 1,
    // Progress is computed dynamically in getQuestShelfAchievements; this is a placeholder.
    getProgress: () => 0,
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

export function getQuestShelfAchievements(
  games: Game[],
  queueState?: PlatformQueueState,
  ctx?: AchievementContext,
): QuestShelfAchievementProgress[] {
  const lang = ctx?.language ?? 'en';

  function resolve(a: QuestShelfAchievement): QuestShelfAchievementProgress {
    const current = a.getProgress(games, queueState, ctx);
    const target = a.target ?? 1;
    const isUnlocked = current >= target;
    return {
      ...a,
      title: lang === 'cs' && a.titleCs ? a.titleCs : a.title,
      description: lang === 'cs' && a.descriptionCs ? a.descriptionCs : a.description,
      current,
      isUnlocked,
      progressLabel: isUnlocked ? 'Unlocked' : `${Math.min(current, target)} / ${target}`,
    };
  }

  const nonMeta = questShelfAchievementRegistry.filter((a) => !a.isMeta).map(resolve);
  const unlockedNonMetaCount = nonMeta.filter((a) => a.isUnlocked).length;
  const totalNonMeta = nonMeta.length;

  const meta = questShelfAchievementRegistry
    .filter((a) => a.isMeta)
    .map((a): QuestShelfAchievementProgress => {
      if (a.id === 'quest-master') {
        const isUnlocked = unlockedNonMetaCount >= totalNonMeta;
        return {
          ...a,
          title: lang === 'cs' && a.titleCs ? a.titleCs : a.title,
          description: lang === 'cs' && a.descriptionCs ? a.descriptionCs : a.description,
          current: unlockedNonMetaCount,
          isUnlocked,
          progressLabel: isUnlocked ? 'Unlocked' : `${unlockedNonMetaCount} / ${totalNonMeta}`,
          target: totalNonMeta,
        };
      }
      return resolve(a);
    });

  return [...nonMeta, ...meta];
}

export function getActiveQuestShelfAchievement(
  games: Game[],
  selectedActiveBadgeId?: string,
  queueState?: PlatformQueueState,
  ctx?: AchievementContext,
) {
  const achievements = getQuestShelfAchievements(games, queueState, ctx);
  const unlocked = achievements.filter((a) => a.isUnlocked).sort((a, b) => b.priority - a.priority);

  if (selectedActiveBadgeId) {
    const selected = unlocked.find((a) => a.id === selectedActiveBadgeId);
    if (selected) return selected;
  }

  return unlocked[0] ?? null;
}

export function isQuestShelfAchievementId(value: unknown): value is QuestShelfAchievementId {
  return typeof value === 'string' && questShelfAchievementRegistry.some((a) => a.id === value);
}

export function getLegacyComputedShelfTitle(games: Game[]) {
  return getActiveQuestShelfAchievement(games)?.title ?? '';
}
