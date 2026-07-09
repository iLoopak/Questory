import assert from 'node:assert/strict';
import test from 'node:test';
import { getSafeWishlistTitleMatches, normalizeImportMatchTitle } from '../src/domain/imports/titleMatching';
import type { Game } from '../src/types/game';

function game(overrides: Partial<Game>): Game {
  return {
    id: 'game-id',
    title: 'Game Title',
    platform: 'Steam',
    status: 'Want to play',
    coverImage: '',
    playtimeHours: 0,
    tags: [],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'wishlist',
    ...overrides,
  };
}

test('normalizeImportMatchTitle normalizes case, punctuation, whitespace, and current symbol variants', () => {
  assert.equal(normalizeImportMatchTitle('  THE   Witcher: Wild-Hunt!!!  '), 'the witcher wild hunt');
  assert.equal(normalizeImportMatchTitle('Portalâ„˘ 2 Â® Â©'), 'portal 2');
  assert.equal(normalizeImportMatchTitle('Persona™ 5® Royal©'), 'persona 5 royal');
});

test('getSafeWishlistTitleMatches returns unique wishlist title matches only', () => {
  const matches = getSafeWishlistTitleMatches([
    game({ id: 'unique', title: 'Portalâ„˘ 2' }),
    game({ id: 'duplicate-a', title: 'Half-Life 2' }),
    game({ id: 'duplicate-b', title: 'half life 2' }),
    game({ id: 'owned-wishlist', title: 'Elden Ring', steamAppId: 1245620 }),
    game({ id: 'library-match', title: 'Celeste', collectionType: 'library' }),
    game({ id: 'symbols-only', title: '!!!' }),
  ]);

  assert.deepEqual(Array.from(matches.entries()), [['portal 2', 'unique']]);
});
