import { Suspense, lazy } from 'react';
import { PanelLoadingFallback } from '../../../components/PanelLoadingFallback';
import type { AppSectionRouterProps } from '../AppSectionRouter';

const StatsPanel = lazy(() => import('../../../components/StatsPanel').then((m) => ({ default: m.StatsPanel })));

type StatsRouteProps = Pick<AppSectionRouterProps, 'games' | 'queueSummary' | 'setSelectedGameId'>;
export function StatsRoute({ games, queueSummary, setSelectedGameId }: StatsRouteProps) {
  return <Suspense fallback={<PanelLoadingFallback />}><StatsPanel games={games} queueSummary={queueSummary} onOpenDetails={setSelectedGameId} /></Suspense>;
}
