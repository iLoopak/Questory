import { Suspense, lazy } from 'react';
import { PanelLoadingFallback } from '../../../components/PanelLoadingFallback';
import type { AppSectionRouterProps } from '../AppSectionRouter';

const QuestRunnerGame = lazy(() => import('../../../components/QuestRunnerGame').then((m) => ({ default: m.QuestRunnerGame })));

type QuestRunnerRouteProps = Pick<AppSectionRouterProps, 'games'>;
export function QuestRunnerRoute({ games }: QuestRunnerRouteProps) {
  return <div className="px-4 py-4"><Suspense fallback={<PanelLoadingFallback />}><QuestRunnerGame games={games} /></Suspense></div>;
}
