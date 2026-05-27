import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.onboarding.v1';

export const onboardingItemIds = [
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

export type OnboardingItemId = (typeof onboardingItemIds)[number];

export type OnboardingState = {
  completedAt: Partial<Record<OnboardingItemId, string>>;
  hasSeenChecklist: boolean;
  skipped: boolean;
};

const emptyOnboardingState: OnboardingState = {
  completedAt: {},
  hasSeenChecklist: false,
  skipped: false,
};

export function loadOnboardingState(): OnboardingState {
  return loadLocalJson(STORAGE_KEY, emptyOnboardingState, normalizeOnboardingState);
}

export function saveOnboardingState(state: OnboardingState) {
  savePersistedJson(STORAGE_KEY, state);
}

function normalizeOnboardingState(value: unknown): OnboardingState {
  const parsedState = value && typeof value === 'object' ? (value as Partial<OnboardingState>) : {};
  const completedAt =
    parsedState.completedAt && typeof parsedState.completedAt === 'object'
      ? parsedState.completedAt
      : {};

  return {
    completedAt: onboardingItemIds.reduce<OnboardingState['completedAt']>((normalizedItems, itemId) => {
      const completedValue = completedAt[itemId];

      if (typeof completedValue === 'string') {
        normalizedItems[itemId] = completedValue;
      }

      return normalizedItems;
    }, {}),
    hasSeenChecklist: Boolean(parsedState.hasSeenChecklist),
    skipped: Boolean(parsedState.skipped),
  };
}
