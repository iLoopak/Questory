import { ReviewModePanel } from '../../../components/ReviewModePanel';
import type { AppRouterCoreModel, AppRouterGameModel, AppRouterMetadataModel, AppRouterQueueModel, AppRouterReviewModel } from '../AppSectionRouter';

type ReviewModeRouteProps = {
  core: Pick<AppRouterCoreModel, 'setActiveNavItem'>;
  games: Pick<AppRouterGameModel, 'games' | 'reviewIgnoredGameIds'>;
  queue: Pick<AppRouterQueueModel, 'activeQueuePlatforms' | 'platformQueueState' | 'addQueuePlatform'>;
  review: AppRouterReviewModel;
  metadata: Pick<AppRouterMetadataModel, 'refreshingMetadataGameIds' | 'ensureRawgMetadataForGame'>;
};

export function ReviewModeRoute({ core, games, queue, review, metadata }: ReviewModeRouteProps) {
  return (
    <ReviewModePanel
      games={games.games}
      ignoredGameIds={games.reviewIgnoredGameIds}
      queuePlatforms={queue.activeQueuePlatforms}
      queueState={queue.platformQueueState}
      refreshingMetadataGameIds={metadata.refreshingMetadataGameIds}
      reviewModeState={review.reviewModeState}
      confirmCancelConvention={review.confirmCancelConvention}
      source={review.activeReviewSource}
      onAction={review.handleReviewAction}
      onEnsureRawgMetadata={metadata.ensureRawgMetadataForGame}
      onAddPlatform={queue.addQueuePlatform}
      onOpenQueue={() => core.setActiveNavItem('Queue')}
      onRestoreIgnored={review.restoreReviewIgnoredGames}
      onReturnToLibrary={() => core.setActiveNavItem('Library')}
      onSourceChange={review.setReviewSource}
    />
  );
}
