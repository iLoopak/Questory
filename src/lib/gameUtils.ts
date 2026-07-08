import type { Game } from '../types/game';

export function touchGameRecord(game: Game): Game {
  return {
    ...game,
    updatedAt: new Date().toISOString(),
  };
}

export function getRetroDuplicateKey(game: Game) {
  if (game.externalSource !== 'retro-rom') {
    return null;
  }

  const path = (game.romPath ?? game.romUri ?? '').trim().toLowerCase();
  if (path) {
    return `path:${path}`;
  }

  const extension = game.romExtension?.trim().toLowerCase();
  if (!extension) {
    return null;
  }

  return `fallback:${game.platform}:${game.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}:${extension}`;
}

export function createManualGameId(title: string, existingGameIds: Set<string>) {
  const baseId =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'manual-game';
  let id = `manual-${baseId}`;
  let suffix = 2;

  while (existingGameIds.has(id)) {
    id = `manual-${baseId}-${suffix}`;
    suffix += 1;
  }

  return id;
}
