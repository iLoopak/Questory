import { TasteProfilePanel } from '../../../components/TasteProfilePanel';
import type { AppRouterCoreModel, AppRouterGameModel, AppRouterQueueModel } from './routeModels';

type TasteProfileRouteProps = {
  core: Pick<AppRouterCoreModel, 'setActiveNavItem' | 'setSelectedGameId'>;
  games: Pick<AppRouterGameModel, 'games'>;
  queue: Pick<AppRouterQueueModel, 'plannedGameIds'>;
};

export function TasteProfileRoute({ core, games, queue }: TasteProfileRouteProps) {
  return (
    <TasteProfilePanel
      games={games.games}
      plannedGameIds={queue.plannedGameIds}
      onDone={() => {
        core.setSelectedGameId(null);
        core.setActiveNavItem('Home');
      }}
    />
  );
}
