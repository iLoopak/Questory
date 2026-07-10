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

function normalizeDiscoveryInbox(value: unknown): DiscoveryInboxItem[] {
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

export function loadDiscoveryInbox(): DiscoveryInboxItem[] {
  return loadLocalJson(STORAGE_KEY, [], normalizeDiscoveryInbox);
}

export function saveDiscoveryInbox(items: DiscoveryInboxItem[]): void {
  savePersistedJson(STORAGE_KEY, items);
}

export function removeDiscoveryInboxItemForSession(items: DiscoveryInboxItem[], id: string): DiscoveryInboxItem[] {
  return items.filter((item) => item.id !== id);
}
