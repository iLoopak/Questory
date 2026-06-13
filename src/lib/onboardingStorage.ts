import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.onboarding.v1';

export const onboardingItemIds = ['steam-connect', 'platforms', 'queue-game', 'retro-import', 'ready'] as const;

const legacyOnboardingItemIds = [
  'manual-game',
  'steam-api-key',
  'steam-id64',
  'steam-test',
  'steam-import',
  'rawg-api-key',
  'metadata-enriched',
  'wishlist-item',
  'backup-exported',
] as const;

export const allOnboardingItemIds = [...onboardingItemIds, ...legacyOnboardingItemIds] as const;

export type OnboardingItemId = (typeof allOnboardingItemIds)[number];

export type OnboardingState = {
  completedAt: Partial<Record<OnboardingItemId, string>>;
  hasSeenChecklist: boolean;
  skipped: boolean;
  skippedAt: Partial<Record<OnboardingItemId, string>>;
};

const emptyOnboardingState: OnboardingState = {
  completedAt: {},
  hasSeenChecklist: false,
  skipped: false,
  skippedAt: {},
};

export function loadOnboardingState(): OnboardingState {
  return loadLocalJson(STORAGE_KEY, emptyOnboardingState, normalizeOnboardingState);
}

export function saveOnboardingState(state: OnboardingState) {
  savePersistedJson(STORAGE_KEY, normalizeOnboardingState(state));
}

export function normalizeOnboardingState(value: unknown): OnboardingState {
  const parsedState = value && typeof value === 'object' ? (value as Partial<OnboardingState>) : {};
  const completedAt =
    parsedState.completedAt && typeof parsedState.completedAt === 'object'
      ? parsedState.completedAt
      : {};
  const skippedAt =
    parsedState.skippedAt && typeof parsedState.skippedAt === 'object'
      ? parsedState.skippedAt
      : {};

  return {
    completedAt: normalizeOnboardingTimestamps(completedAt),
    hasSeenChecklist: Boolean(parsedState.hasSeenChecklist),
    skipped: Boolean(parsedState.skipped),
    skippedAt: normalizeOnboardingTimestamps(skippedAt),
  };
}

function normalizeOnboardingTimestamps(value: Partial<Record<OnboardingItemId, string>>) {
  return allOnboardingItemIds.reduce<OnboardingState['completedAt']>((normalizedItems, itemId) => {
    const itemValue = value[itemId];

    if (typeof itemValue === 'string') {
      normalizedItems[itemId] = itemValue;
    }

    return normalizedItems;
  }, {});
}
