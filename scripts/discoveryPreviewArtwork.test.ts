import assert from 'node:assert/strict';
import test from 'node:test';
import { discoveryGameToGame } from '../src/lib/discovery';
import { getGameCoverSources } from '../src/lib/gameCoverImages';
import type { Game } from '../src/types/game';

test('discovery preview synthetic games mark RAWG cover artwork as RAWG sourced', () => {
  const game = discoveryGameToGame({
    rawgId: 42,
    title: 'Control Resonant',
    coverUrl: 'https://media.rawg.io/covers/control.jpg',
    metacritic: null,
    platforms: ['PC'],
    hasSteamVersion: true,
    genres: [],
    tags: [],
    released: null,
    slug: 'control-resonant',
  }, 'preview');

  assert.equal(game.coverImage, 'https://media.rawg.io/covers/control.jpg');
  assert.equal(game.artworkSource, 'rawg');
});

test('RAWG cover remains the first portrait candidate when metadata has a separate background image', () => {
  const game: Game = {
    id: 'preview-42',
    title: 'Control Resonant',
    platform: 'Steam',
    status: 'Want to play',
    coverImage: 'https://media.rawg.io/covers/control.jpg',
    artworkSource: 'rawg',
    backgroundImage: 'https://media.rawg.io/backgrounds/control-hero.jpg',
    playtimeHours: 0,
    tags: [],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
  };

  const sources = getGameCoverSources(game, { includeGeneratedFallback: false });

  assert.deepEqual(sources, [
    'https://media.rawg.io/covers/control.jpg',
    'https://media.rawg.io/backgrounds/control-hero.jpg',
  ]);
});
