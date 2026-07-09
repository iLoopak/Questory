import { Suspense, lazy } from 'react';
import { PanelLoadingFallback } from '../../../components/PanelLoadingFallback';
import type { AppSectionRouteModel } from '../AppSectionRouter';

const StatsPanel = lazy(() => import('../../../components/StatsPanel').then((m) => ({ default: m.StatsPanel })));

type StatsRouteProps = Pick<AppSectionRouteModel, 'games' | 'queueSummary' | 'setSelectedGameId'>;
export function StatsRoute({ games, queueSummary, setSelectedGameId }: StatsRouteProps) {
  return <Suspense fallback={<PanelLoadingFallback />}><StatsPanel games={games} queueSummary={queueSummary} onOpenDetails={setSelectedGameId} /></Suspense>;
}
