import type { Dispatch, SetStateAction } from 'react';
import { useQuestShelfNotifications } from '../../hooks/useQuestShelfNotifications';
import type { Game } from '../../types/game';
import type { IgnoredSteamGame } from '../../lib/steamIgnoredGamesStorage';
import type { PlatformQueueState } from '../../lib/platformQueueStorage';
import type { PlayActivityRecord } from '../../lib/playActivityStorage';
import type { ReviewModeState } from '../../lib/reviewModeStorage';
import type { NavItem } from '../../config/navigation';

type UseToastStateOptions = {
  activeNavItem: NavItem;
  games: Game[];
  ignoredSteamGames: IgnoredSteamGame[];
  playActivity: PlayActivityRecord[];
  platformQueueState: PlatformQueueState;
  reviewModeState: ReviewModeState;
  selectedGameId: string | null;
  setGames: Dispatch<SetStateAction<Game[]>>;
  setIgnoredSteamGames: Dispatch<SetStateAction<IgnoredSteamGame[]>>;
  setPlayActivity: Dispatch<SetStateAction<PlayActivityRecord[]>>;
  setPlatformQueueState: Dispatch<SetStateAction<PlatformQueueState>>;
  setReviewModeState: Dispatch<SetStateAction<ReviewModeState>>;
  setSelectedGameId: Dispatch<SetStateAction<string | null>>;
};

export function useToastState(options: UseToastStateOptions) {
  return useQuestShelfNotifications(options);
}
