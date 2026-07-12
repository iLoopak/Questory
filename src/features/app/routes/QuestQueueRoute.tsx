import { QueuePanel } from '../../../components/QueuePanel';
import type { AppRouterCoreModel, AppRouterGameModel, AppRouterMetadataModel, AppRouterQueueModel, AppRouterReviewModel } from './routeModels';

type QuestQueueRouteProps = {
  core: Pick<AppRouterCoreModel, 'mainContentRef' | 'setSelectedGameId'>;
  games: Pick<AppRouterGameModel, 'games'>;
  queue: Pick<AppRouterQueueModel, 'targetQueuePlatform' | 'platformQueueState' | 'addGameToQueue' | 'updateQueueLimit' | 'setPlatformQueueState' | 'moveQueueGame' | 'moveQueueGameToPlatform' | 'playQueueGameNow' | 'updateCurrentlyPlayingGame' | 'removeQueueGame'>;
  review: Pick<AppRouterReviewModel, 'startReviewMode'>;
  metadata: Pick<AppRouterMetadataModel, 'refreshGameMetadataFromActions'>;
};

export function QuestQueueRoute({ core, games, queue, review, metadata }: QuestQueueRouteProps) {
  return (
    <QueuePanel
      games={games.games}
      contentScrollRef={core.mainContentRef}
      initialPlatform={queue.targetQueuePlatform}
      queueState={queue.platformQueueState}
      onAddGameToQueue={queue.addGameToQueue}
      onFindArtwork={(game) => metadata.refreshGameMetadataFromActions(game, 'artwork')}
      onLimitChange={queue.updateQueueLimit}
      onQueueStateChange={queue.setPlatformQueueState}
      onMoveEntry={queue.moveQueueGame}
      onMoveEntryToPlatform={queue.moveQueueGameToPlatform}
      onPlayNow={queue.playQueueGameNow}
      onPlayingAction={queue.updateCurrentlyPlayingGame}
      onOpenDetails={core.setSelectedGameId}
      onRemoveEntry={queue.removeQueueGame}
      onStartReview={() => review.startReviewMode('backlog')}
    />
  );
}
