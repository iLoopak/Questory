import { loadLocalJson, savePersistedJson } from './localPersistence';

export const shelfIdentityStorageKey = 'questshelf.shelfIdentity.v1';
export const questShelfAppIconAvatarUrl = '/icons/questshelf-icon.png';
export const maxShelfNameLength = 48;
export const maxCustomAvatarDataUrlLength = 700_000;
export const maxShelfTitleLength = 32;

export type BuiltInAvatarId = 'controller' | 'achievement-hunter' | 'retro-explorer' | 'rpg-adventurer' | 'sci-fi-pilot' | 'fantasy-hero' | 'collector' | 'backlog-slayer';
export type ShelfAvatarSelection = 'app-icon' | 'steam' | `built-in:${BuiltInAvatarId}` | 'custom';

export type ShelfIdentitySettings = {
  avatarSelection: ShelfAvatarSelection;
  shelfAvatar: ShelfAvatarSelection;
  customAvatarDataUrl: string;
  featuredGameId: string;
  preferences: {
    accentMood: string;
  };
  shelfName: string;
  shelfTitle: string;
};

export const builtInAvatars: Array<{ id: BuiltInAvatarId; label: string; glyph: string; gradient: string }> = [
  { id: 'controller', label: 'Controller', glyph: '🎮', gradient: 'from-mint to-sky-300' },
  { id: 'achievement-hunter', label: 'Achievement Hunter', glyph: '🏆', gradient: 'from-amber-300 to-mint' },
  { id: 'retro-explorer', label: 'Retro Explorer', glyph: '👾', gradient: 'from-fuchsia-400 to-cyan-300' },
  { id: 'rpg-adventurer', label: 'RPG Adventurer', glyph: '⚔️', gradient: 'from-red-400 to-amber-300' },
  { id: 'sci-fi-pilot', label: 'Sci-Fi Pilot', glyph: '🚀', gradient: 'from-sky-300 to-violet-400' },
  { id: 'fantasy-hero', label: 'Fantasy Hero', glyph: '🐉', gradient: 'from-emerald-300 to-purple-400' },
  { id: 'collector', label: 'Collector', glyph: '💎', gradient: 'from-blue-300 to-mint' },
  { id: 'backlog-slayer', label: 'Backlog Slayer', glyph: '☠️', gradient: 'from-mint to-lime-300' },
];

export const shelfTitleOptions = ['Retro Explorer', 'Steam Veteran', 'Achievement Hunter', 'RPG Sage', 'Completionist', 'Indie Discoverer', 'Backlog Slayer'] as const;

const emptyIdentity: ShelfIdentitySettings = {
  avatarSelection: 'app-icon',
  shelfAvatar: 'app-icon',
  customAvatarDataUrl: '',
  featuredGameId: '',
  preferences: { accentMood: '' },
  shelfName: '',
  shelfTitle: '',
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
    featuredGameId: sanitizeFeaturedGameId(parsed.featuredGameId),
    preferences: normalizeShelfPreferences(parsed.preferences),
    shelfName: sanitizeShelfName(parsed.shelfName),
    shelfTitle: sanitizeShelfTitle(parsed.shelfTitle),
  };
}

export function sanitizeShelfName(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, maxShelfNameLength) : '';
}

export function sanitizeShelfTitle(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, maxShelfTitleLength) : '';
}

export function sanitizeFeaturedGameId(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 128) : '';
}

function normalizeShelfPreferences(value: unknown): ShelfIdentitySettings['preferences'] {
  const parsed = value && typeof value === 'object' ? (value as Partial<ShelfIdentitySettings['preferences']>) : {};
  return { accentMood: typeof parsed.accentMood === 'string' ? parsed.accentMood.trim().slice(0, 32) : '' };
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

export function getResolvedShelfName(shelfName: string, legacyTitle: string) {
  return sanitizeShelfName(shelfName) || legacyTitle;
}

export async function resizeAvatarFile(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Avatar resizing is unavailable.');
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale; const height = bitmap.height * scale;
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close?.();
  return canvas.toDataURL('image/webp', 0.82);
}
