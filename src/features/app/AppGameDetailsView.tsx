import type { Game, GameStatus } from '../../types/game';
import type { PlayActivityRecord } from '../../lib/playActivityStorage';
import type { PlatformQueueState } from '../../lib/platformQueueStorage';
import type { SteamAchievementSyncState, SteamPlaytimeRefreshState } from '../../types/steam';
import { GameDetailsView } from '../game-details/GameDetailsView';

export type AppGameDetailsViewProps = {
  game: Game;
  playActivity: PlayActivityRecord[];
  refreshingMetadataGameIds: Set<string>;
  steamAchievementSyncState: SteamAchievementSyncState;
  steamPlaytimeRefreshState: SteamPlaytimeRefreshState;
  platformQueueState: PlatformQueueState;
  onAddToQueue: (game: Game) => void;
  onAddToWishlist: (game: Game) => void;
  onBack: () => void;
  onFindArtwork: (game: Game, mode?: 'metadata' | 'artwork') => void | Promise<unknown>;
  onIgnore: (game: Game) => void;
  onSyncSteamData: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onTrackingChange: (gameId: string, tracking: Pick<Game, 'notes' | 'status' | 'tags'> & Partial<Pick<Game, 'artworkSource' | 'artworkUpdatedAt' | 'coverImage'>>) => void;
  onGameEdit: (gameId: string, changes: Partial<Game>) => void;
  onGameEditSaved: (game: Game) => void;
};

export function AppGameDetailsView({
  game,
  playActivity,
  refreshingMetadataGameIds,
  steamAchievementSyncState,
  steamPlaytimeRefreshState,
  platformQueueState,
  onAddToQueue,
  onAddToWishlist,
  onBack,
  onFindArtwork,
  onIgnore,
  onSyncSteamData,
  onStatusChange,
  onTrackingChange,
  onGameEdit,
  onGameEditSaved,
}: AppGameDetailsViewProps) {
  return (
    <GameDetailsView
      activity={playActivity}
      game={game}
      onAddToQueue={onAddToQueue}
      onAddToWishlist={onAddToWishlist}
      onBack={onBack}
      onFindArtwork={onFindArtwork}
      isFindingArtwork={refreshingMetadataGameIds.has(game.id)}
      onIgnore={onIgnore}
      onSyncSteamData={onSyncSteamData}
      isSteamDataSyncing={steamAchievementSyncState.status === 'loading' || steamPlaytimeRefreshState.status === 'loading'}
      onStatusChange={onStatusChange}
      onTrackingChange={onTrackingChange}
      onGameEdit={onGameEdit}
      onGameEditSaved={onGameEditSaved}
      platformQueueState={platformQueueState}
    />
  );
}
