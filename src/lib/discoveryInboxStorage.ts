import type { DiscoveryGame } from './discovery';
import { loadLocalJson, savePersistedJson } from './localPersistence';
import type { Game } from '../types/game';

export const discoveryInboxStorageKey = 'questshelf.discoveryInbox.v1';

export type DiscoveryInboxSource = 'similar' | 'recommendation' | 'deal' | 'upcoming' | 'manual';

export interface DiscoveryInboxItem {
  id: string;
  rawgId: number;
  game: DiscoveryGame;
  source: DiscoveryInboxSource;
  reason: string;
  createdAt: number;
}

export interface DiscoveryInboxState {
  activeQueue: DiscoveryInboxItem[];
  nextQueue: DiscoveryInboxItem[];
}

export interface AppendDiscoveryInboxRecommendationsResult {
  state: DiscoveryInboxState;
  addedItems: DiscoveryInboxItem[];
}

const emptyDiscoveryInboxState: DiscoveryInboxState = {
  activeQueue: [],
  nextQueue: [],
};

let discoveryInboxRequestGeneration = 0;

export function invalidateDiscoveryInboxRequests(): number {
  discoveryInboxRequestGeneration += 1;
  return discoveryInboxRequestGeneration;
}

export function getDiscoveryInboxRequestGeneration(): number {
  return discoveryInboxRequestGeneration;
}

function normalizeDiscoveryInboxItems(value: unknown): DiscoveryInboxItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DiscoveryInboxItem =>
    item != null &&
    typeof item === 'object' &&
    typeof (item as DiscoveryInboxItem).id === 'string' &&
    typeof (item as DiscoveryInboxItem).rawgId === 'number' &&
    typeof (item as DiscoveryInboxItem).createdAt === 'number' &&
    (item as DiscoveryInboxItem).game != null,
  );
}

function normalizeDiscoveryInboxState(value: unknown): DiscoveryInboxState {
  if (Array.isArray(value)) {
    return { ...emptyDiscoveryInboxState, activeQueue: normalizeDiscoveryInboxItems(value) };
  }

  if (value == null || typeof value !== 'object') return emptyDiscoveryInboxState;

  return {
    activeQueue: normalizeDiscoveryInboxItems((value as DiscoveryInboxState).activeQueue),
    nextQueue: normalizeDiscoveryInboxItems((value as DiscoveryInboxState).nextQueue ?? (value as { deferredQueue?: unknown }).deferredQueue),
  };
}

export function loadDiscoveryInboxState(): DiscoveryInboxState {
  return loadLocalJson(discoveryInboxStorageKey, emptyDiscoveryInboxState, normalizeDiscoveryInboxState);
}

export function saveDiscoveryInboxState(state: DiscoveryInboxState): void {
  savePersistedJson(discoveryInboxStorageKey, normalizeDiscoveryInboxState(state));
}

export function loadDiscoveryInbox(): DiscoveryInboxItem[] {
  return loadDiscoveryInboxState().activeQueue;
}

export function saveDiscoveryInbox(items: DiscoveryInboxItem[]): void {
  const currentState = loadDiscoveryInboxState();
  saveDiscoveryInboxState({ ...currentState, activeQueue: items });
}

export function removeDiscoveryInboxItemForSession(items: DiscoveryInboxItem[], id: string): DiscoveryInboxItem[] {
  return items.filter((item) => item.id !== id);
}

export function startDiscoveryInboxRun(state: DiscoveryInboxState): DiscoveryInboxState {
  if (state.activeQueue.length > 0 || state.nextQueue.length === 0) return state;

  return {
    activeQueue: state.nextQueue,
    nextQueue: [],
  };
}

export function deferDiscoveryInboxItemForFutureSession(state: DiscoveryInboxState, id: string): DiscoveryInboxState {
  const skippedItem = state.activeQueue.find((item) => item.id === id);
  if (!skippedItem) return state;

  return {
    activeQueue: removeDiscoveryInboxItemForSession(state.activeQueue, id),
    nextQueue: upsertDeferredDiscoveryInboxItem(state.nextQueue, skippedItem),
  };
}

export function appendDiscoveryInboxRecommendations(
  state: DiscoveryInboxState,
  games: Array<{ game: DiscoveryGame; reason?: string }>,
): AppendDiscoveryInboxRecommendationsResult {
  const identitySet = new Set([
    ...state.activeQueue.map(getDiscoveryInboxItemIdentity),
    ...state.nextQueue.map(getDiscoveryInboxItemIdentity),
  ]);
  const createdAt = Date.now();
  const addedItems: DiscoveryInboxItem[] = [];

  for (const { game, reason } of games) {
    const identity = getDiscoveryGameIdentity(game);
    if (!identity || identitySet.has(identity)) continue;
    identitySet.add(identity);
    addedItems.push({
      id: `inbox-${createdAt}-${game.rawgId}-${addedItems.length}`,
      rawgId: game.rawgId,
      game,
      source: 'recommendation',
      reason: reason ?? 'Recommended for your Discovery Inbox',
      createdAt,
    });
  }

  if (addedItems.length === 0) return { state, addedItems };

  const stateHasPendingSkippedRun = state.activeQueue.length === 0 && state.nextQueue.length > 0;
  const nextState = stateHasPendingSkippedRun
    ? { ...state, nextQueue: [...state.nextQueue, ...addedItems] }
    : { ...state, activeQueue: [...state.activeQueue, ...addedItems] };

  return { state: nextState, addedItems };
}

export function getDiscoveryInboxItemIdentity(item: DiscoveryInboxItem): string {
  return getDiscoveryGameIdentity(item.game) || `rawg:${item.rawgId}`;
}

export function getDiscoveryGameIdentity(game: DiscoveryGame): string {
  if (Number.isFinite(game.rawgId) && game.rawgId > 0) return `rawg:${game.rawgId}`;
  const normalizedTitle = normalizeDiscoveryInboxIdentity(game.title);
  const normalizedPlatform = normalizeDiscoveryInboxIdentity(game.platforms[0]);
  if (normalizedPlatform && normalizedTitle) return `platform-title:${normalizedPlatform}:${normalizedTitle}`;
  return normalizedTitle ? `title:${normalizedTitle}` : '';
}

function normalizeDiscoveryInboxIdentity(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function restoreDeferredDiscoveryInboxItem(state: DiscoveryInboxState, rawgId: number): DiscoveryInboxState {
  const deferredItem = state.nextQueue.find((item) => item.rawgId === rawgId);
  if (!deferredItem || state.activeQueue.some((item) => item.rawgId === rawgId)) return state;

  return {
    activeQueue: [...state.activeQueue, deferredItem],
    nextQueue: state.nextQueue.filter((item) => item.rawgId !== rawgId),
  };
}

export function reconcileDiscoveryInboxState(state: DiscoveryInboxState, games: Game[]): DiscoveryInboxState {
  const excludedIdentities = new Set(games
    .filter((game) => game.collectionType === 'library' || game.collectionType === 'wishlist' || game.status === 'Playing' || game.status === 'Finished' || game.status === 'Dropped' || game.status === 'Want to play')
    .flatMap(getGameDiscoveryIdentities));
  const keepItem = (item: DiscoveryInboxItem) => !excludedIdentities.has(getDiscoveryInboxItemIdentity(item));
  return {
    activeQueue: state.activeQueue.filter(keepItem),
    nextQueue: state.nextQueue.filter(keepItem),
  };
}

function getGameDiscoveryIdentities(game: Game): string[] {
  const identities: string[] = [];
  if (typeof game.rawgId === 'number' && Number.isFinite(game.rawgId)) identities.push(`rawg:${game.rawgId}`);
  const normalizedTitle = normalizeDiscoveryInboxIdentity(game.rawgTitle ?? game.title);
  const normalizedPlatform = normalizeDiscoveryInboxIdentity(game.platform);
  if (normalizedPlatform && normalizedTitle) identities.push(`platform-title:${normalizedPlatform}:${normalizedTitle}`);
  if (normalizedTitle) identities.push(`title:${normalizedTitle}`);
  return identities;
}

function upsertDeferredDiscoveryInboxItem(items: DiscoveryInboxItem[], item: DiscoveryInboxItem): DiscoveryInboxItem[] {
  const existingIndex = items.findIndex((currentItem) => currentItem.rawgId === item.rawgId);
  if (existingIndex < 0) return [...items, item];

  return items.map((currentItem, index) => (index === existingIndex ? item : currentItem));
}
