import { TasteProfilePanel } from '../../../components/TasteProfilePanel';
import type { AppRouterCoreModel, AppRouterGameModel } from './routeModels';

type TasteProfileRouteProps = {
  core: Pick<AppRouterCoreModel, 'setActiveNavItem' | 'setSelectedGameId'>;
  games: Pick<AppRouterGameModel, 'games'>;
};

export function TasteProfileRoute({ core, games }: TasteProfileRouteProps) {
  return (
    <TasteProfilePanel
      games={games.games}
      onDone={() => {
        core.setSelectedGameId(null);
        core.setActiveNavItem('Home');
      }}
    />
  );
}
