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

test('valid Nintendo JSON imports as Switch library games with metadata', () => {
  const parsed = parseMultiGameImportInput(JSON.stringify({ source: 'nintendo-virtual-game-cards', version: 1, pageUrl: 'https://accounts.nintendo.com/portal/vgcs', exportedAt: '2026-01-01T00:00:00.000Z', games: [{ title: 'Hades', coverUrl: 'https://atum-img-lp1.cdn.nintendo.net/i/c/hades.jpg', detailUrl: 'https://accounts.nintendo.com/portal/vgcs/detail?vgc_id=0100535012974000-abc', vgcId: '0100535012974000-abc', rawTitle: 'Hades', cardType: 'game' }] }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.source, 'nintendo-virtual-game-cards');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].platforms[0], 'Switch');
  assert.equal(parsed.items[0].nintendo?.vgcId, '0100535012974000-abc');

  const merged = mergeMultiGameImport([], parsed, '2026-01-02T00:00:00.000Z');
  assert.equal(merged.summary.importedCount, 1);
  assert.equal(merged.games[0].platform, 'Switch');
  assert.equal(merged.games[0].externalSource, 'nintendo-virtual-game-cards');
  assert.equal(merged.games[0].externalUrl, 'https://accounts.nintendo.com/portal/vgcs/detail?vgc_id=0100535012974000-abc');
  assert.equal(merged.games[0].nintendoVirtualGameCard?.cardType, 'game');
});

test('Nintendo duplicate titles are deduplicated by normalized title and Nintendo platform', () => {
  const parsed = parseMultiGameImportInput(JSON.stringify({ source: 'nintendo-virtual-game-cards', version: 1, games: [{ title: 'Hades' }, { title: ' hades™ ' }] }));
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.duplicateCount, 1);
});

test('Nintendo missing coverUrl is accepted and optional detailUrl/vgcId are preserved when present', () => {
  const parsed = parseMultiGameImportInput(JSON.stringify({ source: 'nintendo-virtual-game-cards', version: 1, games: [{ title: 'No Cover', detailUrl: 'https://accounts.nintendo.com/portal/vgcs/detail?vgc_id=abc', vgcId: 'abc', cardType: 'dlc-or-addon' }] }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.items[0].coverUrl, undefined);
  assert.equal(parsed.items[0].nintendo?.detailUrl, 'https://accounts.nintendo.com/portal/vgcs/detail?vgc_id=abc');
  assert.equal(parsed.items[0].nintendo?.vgcId, 'abc');
});

test('Nintendo merge updates only missing source metadata and cover for existing Nintendo match', () => {
  const existing: Game = { id: 'switch-hades', title: 'Hades', platform: 'Switch', status: 'Finished', coverImage: '', artworkSource: 'generated-fallback', playtimeHours: 10, rating: 5, tags: ['favorite'], lastPlayedAt: null, notes: 'keep notes', collectionType: 'library' };
  const parsed = parseMultiGameImportInput(JSON.stringify({ source: 'nintendo-virtual-game-cards', version: 1, games: [{ title: 'Hades', coverUrl: 'cover.jpg', detailUrl: 'detail', vgcId: 'vgc' }] }));
  const merged = mergeMultiGameImport([existing], parsed, '2026-01-02T00:00:00.000Z');
  assert.equal(merged.games.length, 1);
  assert.equal(merged.summary.updatedExisting, 1);
  assert.equal(merged.games[0].status, 'Finished');
  assert.equal(merged.games[0].rating, 5);
  assert.deepEqual(merged.games[0].tags, ['favorite']);
  assert.equal(merged.games[0].notes, 'keep notes');
  assert.equal(merged.games[0].coverImage, 'cover.jpg');
  assert.equal(merged.games[0].nintendoVirtualGameCard?.vgcId, 'vgc');
});
