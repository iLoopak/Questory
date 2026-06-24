import { loadLocalJson, savePersistedJson } from './localPersistence';
import type { Game } from '../types/game';
import { getLegacyComputedShelfTitle, isQuestShelfAchievementId, type QuestShelfAchievementId } from './questShelfAchievements';

export const shelfIdentityStorageKey = 'questshelf.shelfIdentity.v1';
export const questShelfAppIconAvatarUrl = '/icons/questshelf-icon-180.png';
export const maxShelfNameLength = 32;
export const maxCustomAvatarDataUrlLength = 700_000;
export const maxCustomAvatarFileSize = 10 * 1024 * 1024;

export type BuiltInAvatarId = 'controller' | 'achievement-hunter' | 'retro-explorer' | 'rpg-adventurer' | 'sci-fi-pilot' | 'fantasy-hero' | 'collector' | 'backlog-slayer' | 'curator' | 'platform-hopper' | 'handheld-hero' | 'playing-right-now' | 'metadata-master' | 'art-conservator' | 'queue-commander' | 'century-club';
export type ShelfAvatarSelection = 'app-icon' | 'steam' | `built-in:${BuiltInAvatarId}` | 'custom';

export type FeaturedGameMode = 'automatic-most-played' | 'automatic-achievement-completion' | 'automatic-recently-played' | 'manual';

export type ShelfIdentitySettings = {
  avatarSelection: ShelfAvatarSelection;
  shelfAvatar: ShelfAvatarSelection;
  customAvatarDataUrl: string;
  shelfName: string;
  selectedActiveBadgeId: QuestShelfAchievementId | '';
  featuredGameMode: FeaturedGameMode;
  manualFeaturedGameId: string;
};

export const builtInAvatars: Array<{ id: BuiltInAvatarId; label: string; icon: string }> = [
  { id: 'controller', label: 'Controller', icon: 'gamepad-2' },
  { id: 'achievement-hunter', label: 'Achievement Hunter', icon: 'trophy' },
  { id: 'retro-explorer', label: 'Retro Explorer', icon: 'joystick' },
  { id: 'rpg-adventurer', label: 'RPG Adventurer', icon: 'sword' },
  { id: 'sci-fi-pilot', label: 'Sci-Fi Pilot', icon: 'rocket' },
  { id: 'fantasy-hero', label: 'Fantasy Hero', icon: 'sparkles' },
  { id: 'collector', label: 'Collector', icon: 'gem' },
  { id: 'backlog-slayer', label: 'Backlog Slayer', icon: 'skull-check' },
  { id: 'curator', label: 'Curator', icon: 'bookmark-pen' },
  { id: 'platform-hopper', label: 'Platform Hopper', icon: 'panel-top-open' },
  { id: 'handheld-hero', label: 'Handheld Hero', icon: 'handheld' },
  { id: 'playing-right-now', label: 'Playing Right Now', icon: 'flame' },
];

const emptyIdentity: ShelfIdentitySettings = {
  avatarSelection: 'app-icon',
  shelfAvatar: 'app-icon',
  customAvatarDataUrl: '',
  shelfName: '',
  selectedActiveBadgeId: '',
  featuredGameMode: 'automatic-most-played',
  manualFeaturedGameId: '',
};

export function loadShelfIdentitySettings(): ShelfIdentitySettings {
  return loadLocalJson(shelfIdentityStorageKey, emptyIdentity, normalizeShelfIdentitySettings);
}

export function saveShelfIdentitySettings(settings: ShelfIdentitySettings) {
  savePersistedJson(shelfIdentityStorageKey, normalizeShelfIdentitySettings(settings));
}

export function normalizeShelfIdentitySettings(value: unknown): ShelfIdentitySettings {
  const parsed = value && typeof value === 'object' ? (value as Partial<ShelfIdentitySettings>) : {};
  const customAvatarDataUrl = sanitizeAvatarDataUrl(parsed.customAvatarDataUrl);
  let avatarSelection = normalizeAvatarSelection(parsed.avatarSelection ?? parsed.shelfAvatar);
  if (avatarSelection === 'custom' && !customAvatarDataUrl) avatarSelection = 'app-icon';
  return {
    avatarSelection,
    shelfAvatar: avatarSelection,
    customAvatarDataUrl,
    shelfName: sanitizeShelfNickname(parsed.shelfName),
    selectedActiveBadgeId: normalizeActiveBadgeId(parsed.selectedActiveBadgeId),
    featuredGameMode: normalizeFeaturedGameMode(parsed.featuredGameMode),
    manualFeaturedGameId: typeof parsed.manualFeaturedGameId === 'string' ? parsed.manualFeaturedGameId : '',
  };
}

export function normalizeFeaturedGameMode(value: unknown): FeaturedGameMode {
  if (
    value === 'automatic-most-played'
    || value === 'automatic-achievement-completion'
    || value === 'automatic-recently-played'
    || value === 'manual'
  ) {
    return value;
  }
  return 'automatic-most-played';
}

function normalizeActiveBadgeId(value: unknown): ShelfIdentitySettings['selectedActiveBadgeId'] {
  if (value === 'wishlist-curator') return 'curator';
  return isQuestShelfAchievementId(value) ? value : '';
}

export function sanitizeShelfName(value: unknown) {
  return sanitizeShelfNickname(value);
}

export function sanitizeShelfNickname(value: unknown) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const withoutBrandedSuffix = normalized.replace(/[’']s\s+(QuestShelf|Questory)$/i, '').trim();
  const withoutBrandedPrefix = withoutBrandedSuffix.replace(/^(QuestShelf|Questory)\s*:\s*/i, '').trim();
  if (/^(My (QuestShelf|Questory)|Můj (QuestShelf|Questory))$/i.test(withoutBrandedPrefix)) return '';
  if (/^(QuestShelf|Questory)$/i.test(withoutBrandedPrefix)) return '';
  return withoutBrandedPrefix.slice(0, maxShelfNameLength);
}

export function formatShelfDisplayName(nickname: string | null | undefined, language: 'en' | 'cs' = 'en') {
  const normalizedNickname = sanitizeShelfNickname(nickname);
  if (language === 'cs') return normalizedNickname ? `Questory: ${normalizedNickname}` : 'Můj Questory';
  return normalizedNickname ? `${normalizedNickname}'s Questory` : 'My Questory';
}

export function sanitizeAvatarDataUrl(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('data:image/') || value.length > maxCustomAvatarDataUrlLength) return '';
  return value;
}

export function normalizeAvatarSelection(value: unknown): ShelfAvatarSelection {
  if (value === 'app-icon' || value === 'steam' || value === 'custom') return value;
  if (typeof value === 'string' && value.startsWith('built-in:')) {
    const legacyAvatarIds: Record<string, BuiltInAvatarId> = { retro: 'retro-explorer', rpg: 'rpg-adventurer', 'sci-fi': 'sci-fi-pilot', fantasy: 'fantasy-hero' };
    const rawId = value.slice('built-in:'.length);
    const id = (legacyAvatarIds[rawId] ?? rawId) as BuiltInAvatarId;
    if (builtInAvatars.some((avatar) => avatar.id === id)) return `built-in:${id}`;
  }
  return 'app-icon';
}


export function getComputedShelfTitle(games: Game[]) {
  return getLegacyComputedShelfTitle(games);
}


export function getComputedFeaturedGame(games: Game[]) {
  return getAutomaticMostPlayedFeaturedGame(getLibraryGames(games));
}

export function getResolvedFeaturedGame(games: Game[], settings?: Pick<ShelfIdentitySettings, 'featuredGameMode' | 'manualFeaturedGameId'> | null) {
  const libraryGames = getLibraryGames(games);
  const mode = normalizeFeaturedGameMode(settings?.featuredGameMode);

  if (mode === 'manual') {
    const manualGame = libraryGames.find((game) => game.id === settings?.manualFeaturedGameId);
    if (manualGame) return manualGame;
    return getAutomaticMostPlayedFeaturedGame(libraryGames);
  }

  if (mode === 'automatic-achievement-completion') return getHighestAchievementCompletionFeaturedGame(libraryGames);
  if (mode === 'automatic-recently-played') return getMostRecentlyPlayedFeaturedGame(libraryGames);
  return getAutomaticMostPlayedFeaturedGame(libraryGames);
}

function getLibraryGames(games: Game[]) {
  return games.filter((game) => game.collectionType === 'library');
}

function getAutomaticMostPlayedFeaturedGame(libraryGames: Game[]) {
  return libraryGames
    .map((game) => ({ game, score: getFeaturedGameScore(game) }))
    .filter(({ score }) => score > 0)
    .sort((first, second) => second.score - first.score || first.game.title.localeCompare(second.game.title))[0]?.game ?? null;
}

function getHighestAchievementCompletionFeaturedGame(libraryGames: Game[]) {
  return libraryGames
    .filter((game) => typeof game.steamAchievementsPercent === 'number' && typeof game.steamAchievementsTotal === 'number' && game.steamAchievementsTotal > 0)
    .sort((first, second) => (second.steamAchievementsPercent ?? 0) - (first.steamAchievementsPercent ?? 0) || first.title.localeCompare(second.title))[0] ?? getAutomaticMostPlayedFeaturedGame(libraryGames);
}

function getMostRecentlyPlayedFeaturedGame(libraryGames: Game[]) {
  return libraryGames
    .filter((game) => Boolean(game.lastPlayedAt))
    .sort((first, second) => Date.parse(second.lastPlayedAt ?? '') - Date.parse(first.lastPlayedAt ?? '') || first.title.localeCompare(second.title))[0] ?? getAutomaticMostPlayedFeaturedGame(libraryGames);
}

function getFeaturedGameScore(game: Game) {
  return (game.favorite ? 10_000 : 0)
    + Math.max(0, game.playtimeHours ?? 0) * 100
    + (game.status === 'Playing' ? 750 : 0)
    + (game.status === 'Finished' ? 500 : 0)
    + (game.rating ?? 0) * 50
    + (game.steamAchievementsPercent ?? 0);
}


export function getResolvedShelfName(shelfName: string, legacyTitle: string, language: 'en' | 'cs' = 'en') {
  return formatShelfDisplayName(sanitizeShelfNickname(shelfName) || sanitizeShelfNickname(legacyTitle), language);
}

export async function resizeAvatarFile(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > maxCustomAvatarFileSize) throw new Error('Choose an image smaller than 10 MB.');

  const source = await loadAvatarImageSource(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Avatar resizing is unavailable.');

  const scale = Math.max(size / source.width, size / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.drawImage(source.image, (size - width) / 2, (size - height) / 2, width, height);
  source.close?.();

  const webpDataUrl = canvas.toDataURL('image/webp', 0.82);
  const dataUrl = webpDataUrl.startsWith('data:image/webp') ? webpDataUrl : canvas.toDataURL('image/png');
  if (dataUrl.length > maxCustomAvatarDataUrlLength) throw new Error('Avatar is still too large after resizing. Try a smaller image.');
  return dataUrl;
}

type AvatarImageSource = {
  image: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

async function loadAvatarImageSource(file: File): Promise<AvatarImageSource> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch {
      // Fall back to HTMLImageElement decoding below for WebViews with partial createImageBitmap support.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not read that image file.'));
      image.src = objectUrl;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
