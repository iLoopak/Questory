import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameCoverImage } from '../src/components/GameCoverImage';
import { GameHero } from '../src/components/game-detail/GameHero';
import type { Game } from '../src/types/game';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { actAsync, renderComponent, renderHook } from './testUtils/reactHarness';
import { useSemanticImageSource } from '../src/hooks/useSemanticImageSource';

assertTestEnvironment();

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'image-game',
    title: 'Image Game',
    platform: 'Steam',
    status: 'Playing',
    coverImage: 'https://cdn/primary.jpg',
    artworkSource: 'rawg',
    artworkUpdatedAt: '2026-01-01T00:00:00.000Z',
    backgroundImage: 'https://cdn/fallback.jpg',
    playtimeHours: 1,
    tags: [],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
    ...overrides,
  };
}

function mainImage(): HTMLImageElement | null {
  return document.querySelector('img:not([data-semantic-image-probe])');
}

function probeImage(): HTMLImageElement | null {
  return document.querySelector('img[data-semantic-image-probe="true"]');
}

async function dispatchImageEvent(image: HTMLImageElement, type: 'load' | 'error') {
  await actAsync(() => image.dispatchEvent(new window.Event(type)));
}

test('failed primary advances to fallback and identical metadata does not reset it', async () => {
  resetWebStorage();
  const game = makeGame();
  const handle = await renderComponent(GameCoverImage, { game });

  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/primary.jpg');
  await dispatchImageEvent(mainImage()!, 'error');
  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/fallback.jpg');
  await dispatchImageEvent(mainImage()!, 'load');

  await handle.rerender({ game: { ...game, notes: 'delayed metadata with identical artwork' } });
  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/fallback.jpg');
  assert.equal(probeImage(), null, 'a new Game object does not retry the known failed primary');
  await handle.unmount();
});

test('replacement keeps the working image until the candidate loads', async () => {
  resetWebStorage();
  const game = makeGame();
  const handle = await renderComponent(GameCoverImage, { game });
  await dispatchImageEvent(mainImage()!, 'error');
  await dispatchImageEvent(mainImage()!, 'load');

  await handle.rerender({ game: { ...game, coverImage: 'https://cdn/replacement.jpg', artworkUpdatedAt: '2026-01-02T00:00:00.000Z' } });
  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/fallback.jpg', 'last success remains visible');
  assert.equal(probeImage()?.getAttribute('src'), 'https://cdn/replacement.jpg');

  await dispatchImageEvent(probeImage()!, 'load');
  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/replacement.jpg');
  await handle.unmount();
});

test('all failed sources leave the parent placeholder stable', async () => {
  resetWebStorage();
  const handle = await renderComponent(GameCoverImage, {
    game: makeGame({ backgroundImage: undefined }),
    usage: 'micro' as const,
  });
  await dispatchImageEvent(mainImage()!, 'error');
  assert.equal(mainImage(), null);
  await handle.unmount();
});

test('an explicit artwork revision retries sources without blanking the fallback', async () => {
  resetWebStorage();
  const game = makeGame();
  const handle = await renderComponent(GameCoverImage, { game });
  await dispatchImageEvent(mainImage()!, 'error');
  await dispatchImageEvent(mainImage()!, 'load');

  await handle.rerender({ game: { ...game, artworkUpdatedAt: '2026-01-03T00:00:00.000Z' } });
  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/fallback.jpg');
  assert.equal(probeImage()?.getAttribute('src'), 'https://cdn/primary.jpg', 'the explicit revision starts a fresh candidate cycle');
  await handle.unmount();
});

test('manual override and clear-override transition only after the provider image loads', async () => {
  resetWebStorage();
  const manual = makeGame({ artworkSource: 'user', coverImage: 'https://cdn/manual.jpg' });
  const handle = await renderComponent(GameCoverImage, { game: manual });
  await dispatchImageEvent(mainImage()!, 'load');

  await handle.rerender({
    game: makeGame({ artworkSource: undefined, artworkUpdatedAt: '2026-01-04T00:00:00.000Z', coverImage: '' }),
  });
  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/manual.jpg');
  assert.equal(probeImage()?.getAttribute('src'), 'https://cdn/fallback.jpg');
  await dispatchImageEvent(probeImage()!, 'load');
  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/fallback.jpg');
  await handle.unmount();
});

test('switching games immediately removes the previous game image', async () => {
  resetWebStorage();
  const gameA = makeGame({ id: 'a', coverImage: 'https://cdn/a.jpg' });
  const gameB = makeGame({ id: 'b', coverImage: 'https://cdn/b.jpg' });
  const handle = await renderComponent(GameCoverImage, { game: gameA });
  const oldImage = mainImage()!;
  await dispatchImageEvent(oldImage, 'load');

  await handle.rerender({ game: gameB });
  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/b.jpg');
  await dispatchImageEvent(oldImage, 'load');
  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/b.jpg', 'a detached A image cannot commit over B');
  await handle.unmount();
});

test('already-complete cached images are recorded as the successful source', async () => {
  resetWebStorage();
  const completeDescriptor = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'complete');
  const naturalWidthDescriptor = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'naturalWidth');
  Object.defineProperty(window.HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 100 });

  const game = makeGame({ backgroundImage: undefined });
  const handle = await renderComponent(GameCoverImage, { game });

  if (completeDescriptor) Object.defineProperty(window.HTMLImageElement.prototype, 'complete', completeDescriptor);
  if (naturalWidthDescriptor) Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', naturalWidthDescriptor);
  await handle.rerender({ game: { ...game, coverImage: 'https://cdn/new-cached-replacement.jpg', artworkUpdatedAt: '2026-01-05T00:00:00.000Z' } });

  assert.equal(mainImage()?.getAttribute('src'), 'https://cdn/primary.jpg', 'the cached source is retained during replacement');
  assert.equal(probeImage()?.getAttribute('src'), 'https://cdn/new-cached-replacement.jpg');
  await handle.unmount();
});

test('GameHero retains its loaded background until a replacement succeeds', async () => {
  resetWebStorage();
  const game = makeGame({ heroImage: 'https://cdn/hero-old.jpg' });
  const handle = await renderComponent(GameHero, { game, kicker: 'Preview', onBack: () => {} });
  const oldHero = [...document.querySelectorAll('img')].find((image) => image.getAttribute('src') === 'https://cdn/hero-old.jpg') as HTMLImageElement;
  await dispatchImageEvent(oldHero, 'load');

  await handle.rerender({ game: { ...game, heroImage: 'https://cdn/hero-new.jpg', artworkUpdatedAt: '2026-01-06T00:00:00.000Z' }, kicker: 'Preview', onBack: () => {} });
  const sources = [...document.querySelectorAll('img')].map((image) => image.getAttribute('src'));
  assert.ok(sources.includes('https://cdn/hero-old.jpg'));
  assert.ok(sources.includes('https://cdn/hero-new.jpg'));
  const newHeroProbe = [...document.querySelectorAll('img[data-semantic-image-probe="true"]')].find((image) => image.getAttribute('src') === 'https://cdn/hero-new.jpg') as HTMLImageElement;
  await dispatchImageEvent(newHeroProbe, 'load');
  assert.ok([...document.querySelectorAll('img:not([data-semantic-image-probe])')].some((image) => image.getAttribute('src') === 'https://cdn/hero-new.jpg'));
  await handle.unmount();
});

test('semantic image callbacks are inert after unmount', async () => {
  const handle = await renderHook(
    (sources: string[]) => useSemanticImageSource({ gameId: 'cleanup', sources }),
    ['https://cdn/cleanup.jpg'],
  );
  const markLoaded = handle.current.markSourceLoaded;
  const markFailed = handle.current.markSourceFailed;
  await handle.unmount();
  assert.doesNotThrow(() => {
    markLoaded('https://cdn/cleanup.jpg');
    markFailed('https://cdn/cleanup.jpg');
  });
});
