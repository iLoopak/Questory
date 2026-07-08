import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeMultiGameImport, parseMultiGameImportInput } from '../src/lib/multiGameImport';
import type { Game } from '../src/types/game';

const titles = Array.from({ length: 10 }, (_, index) => `Game ${index + 1}`).join('\n');

test('plain text import: 10 lines = 10 games', () => {
  const parsed = parseMultiGameImportInput(titles);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.items.length, 10);
});

test('plain text ignores blank lines and deduplicates repeated titles', () => {
  const parsed = parseMultiGameImportInput('Elden Ring\n\n elden   ring \nNine Sols\n');
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.duplicateCount, 1);
  assert.equal(parsed.skippedCount, 2);
});

test('valid PlayStation JSON imports metadata and allows missing coverUrl', () => {
  const parsed = parseMultiGameImportInput(JSON.stringify({ source: 'playstation-library', version: 1, pageUrl: 'https://library.playstation.com/recently-purchased/2', pageNumber: 2, exportedAt: '2026-01-01T00:00:00.000Z', games: [{ title: 'Darktide', platforms: ['PS5'], coverUrl: 'https://image.api.playstation.com/a.jpg' }, { title: 'No Cover', platforms: ['PS4'] }] }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.source, 'playstation-library');
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[1].coverUrl, undefined);
});

test('invalid JSON shows helpful error instead of treating JSON as titles', () => {
  const parsed = parseMultiGameImportInput('{"source":"playstation-library",');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error ?? '', /could not parse/i);
  assert.equal(parsed.items.length, 0);
});

test('PlayStation duplicate title/platform entries collapse but PS4 and PS5 are preserved', () => {
  const parsed = parseMultiGameImportInput(JSON.stringify({ source: 'playstation-library', version: 1, games: [{ title: 'Journey', platforms: ['PS4'] }, { title: 'Journey', platforms: ['PS4'] }, { title: 'Journey', platforms: ['PS5'] }] }));
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.duplicateCount, 1);
});

test('PlayStation merge does not overwrite existing Steam games with same title', () => {
  const steamGame: Game = { id: 'steam-1', title: 'Journey', platform: 'Steam', status: 'Finished', coverImage: 'steam.jpg', playtimeHours: 1, tags: [], lastPlayedAt: null, notes: 'keep', collectionType: 'library', externalSource: 'steam' };
  const parsed = parseMultiGameImportInput(JSON.stringify({ source: 'playstation-library', version: 1, games: [{ title: 'Journey', platforms: ['PS5'], coverUrl: 'ps.jpg' }] }));
  const merged = mergeMultiGameImport([steamGame], parsed);
  assert.equal(merged.games.length, 2);
  assert.equal(merged.games[0].coverImage, 'steam.jpg');
});
