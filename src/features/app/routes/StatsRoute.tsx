import { Suspense, lazy } from 'react';
import { PanelLoadingFallback } from '../../../components/PanelLoadingFallback';
import type { AppRouterCoreModel, AppRouterGameModel, AppRouterQueueModel } from './routeModels';

const StatsPanel = lazy(() => import('../../../components/StatsPanel').then((m) => ({ default: m.StatsPanel })));

type StatsRouteProps = {
  core: Pick<AppRouterCoreModel, 'setSelectedGameId'>;
  games: Pick<AppRouterGameModel, 'games'>;
  queue: Pick<AppRouterQueueModel, 'queueSummary'>;
};

export function StatsRoute({ core, games, queue }: StatsRouteProps) {
  return (
    <Suspense fallback={<PanelLoadingFallback />}>
      <StatsPanel games={games.games} queueSummary={queue.queueSummary} onOpenDetails={core.setSelectedGameId} />
    </Suspense>
  );
}
