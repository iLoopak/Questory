import type { TFunction } from '../../../i18n';
import type { WeeklyStats } from '../types';

interface WeeklySummaryProps {
  stats: WeeklyStats;
  t: TFunction;
}

export function WeeklySummary({ stats, t }: WeeklySummaryProps) {
  if (stats.played === 0) return null;

  return (
    <div className="rounded-xl border border-skyglass/12 bg-ink-950/50 p-3">
      <div className="mb-2 text-2xs font-semibold uppercase tracking-widest text-slate-500">
        {t('dailyQuest.weeklyStats')}
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label={t('dailyQuest.solved')} value={`${stats.solved}/${stats.played}`} />
        <Stat label={t('dailyQuest.avgScore')} value={stats.avgScore > 0 ? String(stats.avgScore) : '—'} />
        <Stat label={t('dailyQuest.streak')} value={stats.currentStreak > 0 ? `${stats.currentStreak}🔥` : '0'} />
        <Stat label={t('dailyQuest.bestStreak')} value={stats.bestStreak > 0 ? String(stats.bestStreak) : '0'} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-base font-bold text-white">{value}</span>
      <span className="mt-0.5 text-2xs text-slate-500">{label}</span>
    </div>
  );
}
