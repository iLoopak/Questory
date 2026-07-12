import { TasteProfilePanel } from '../../../components/TasteProfilePanel';
import { getPlannedGameIds } from '../../../lib/plannedGames';
import type { AppRouterCoreModel, AppRouterGameModel, AppRouterQueueModel } from './routeModels';

type TasteProfileRouteProps = {
  core: Pick<AppRouterCoreModel, 'setActiveNavItem' | 'setSelectedGameId'>;
  games: Pick<AppRouterGameModel, 'games'>;
  queue: Pick<AppRouterQueueModel, 'platformQueueState'>;
};

export function TasteProfileRoute({ core, games, queue }: TasteProfileRouteProps) {
  return (
    <TasteProfilePanel
      games={games.games}
      plannedGameIds={getPlannedGameIds(queue.platformQueueState, games.games)}
      onDone={() => {
        core.setSelectedGameId(null);
        core.setActiveNavItem('Home');
      }}
    />
  );
}
