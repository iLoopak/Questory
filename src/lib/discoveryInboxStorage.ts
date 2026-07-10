import type { DiscoveryGame } from './discovery';
import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.discoveryInbox.v1';

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

const emptyDiscoveryInboxState: DiscoveryInboxState = {
  activeQueue: [],
  nextQueue: [],
};

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
  return loadLocalJson(STORAGE_KEY, emptyDiscoveryInboxState, normalizeDiscoveryInboxState);
}

export function saveDiscoveryInboxState(state: DiscoveryInboxState): void {
  savePersistedJson(STORAGE_KEY, normalizeDiscoveryInboxState(state));
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

export function restoreDeferredDiscoveryInboxItem(state: DiscoveryInboxState, rawgId: number): DiscoveryInboxState {
  const deferredItem = state.nextQueue.find((item) => item.rawgId === rawgId);
  if (!deferredItem || state.activeQueue.some((item) => item.rawgId === rawgId)) return state;

  return {
    activeQueue: [...state.activeQueue, deferredItem],
    nextQueue: state.nextQueue.filter((item) => item.rawgId !== rawgId),
  };
}

function upsertDeferredDiscoveryInboxItem(items: DiscoveryInboxItem[], item: DiscoveryInboxItem): DiscoveryInboxItem[] {
  const existingIndex = items.findIndex((currentItem) => currentItem.rawgId === item.rawgId);
  if (existingIndex < 0) return [...items, item];

  return items.map((currentItem, index) => (index === existingIndex ? item : currentItem));
}
