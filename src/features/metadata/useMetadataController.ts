import { useState, type Dispatch, type SetStateAction } from 'react';
import { useMetadataArtworkActions, type MetadataSelectionRequest } from '../../hooks/useMetadataArtworkActions';
import type { Game } from '../../types/game';
import type { OnboardingItemId } from '../../lib/onboardingStorage';
import type { NavItem } from '../../config/navigation';

export function useMetadataController(args: {
  addToastNotification: Parameters<typeof useMetadataArtworkActions>[0]['addToastNotification'];
  games: Game[];
  markOnboardingItemComplete: (itemId: OnboardingItemId) => void;
  setActiveNavItem: Dispatch<SetStateAction<NavItem>>;
  setGames: Dispatch<SetStateAction<Game[]>>;
  setSelectedGameId: Dispatch<SetStateAction<string | null>>;
  t: Parameters<typeof useMetadataArtworkActions>[0]['t'];
}) {
  const [metadataSelectionRequest, setMetadataSelectionRequest] = useState<MetadataSelectionRequest | null>(null);
  const [refreshingMetadataGameIds, setRefreshingMetadataGameIds] = useState<Set<string>>(new Set());
  const actions = useMetadataArtworkActions({ ...args, refreshingMetadataGameIds, setMetadataSelectionRequest, setRefreshingMetadataGameIds });
  return { metadataSelectionRequest, refreshingMetadataGameIds, ...actions };
}
