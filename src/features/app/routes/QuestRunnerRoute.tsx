import { Suspense, lazy } from 'react';
import { PanelLoadingFallback } from '../../../components/PanelLoadingFallback';
import type { AppRouterGameModel } from '../AppSectionRouter';

const QuestRunnerGame = lazy(() => import('../../../components/QuestRunnerGame').then((m) => ({ default: m.QuestRunnerGame })));

type QuestRunnerRouteProps = {
  games: Pick<AppRouterGameModel, 'games'>;
};

export function QuestRunnerRoute({ games }: QuestRunnerRouteProps) {
  return (
    <div className="px-4 py-4">
      <Suspense fallback={<PanelLoadingFallback />}>
        <QuestRunnerGame games={games.games} />
      </Suspense>
    </div>
  );
}
