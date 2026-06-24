import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import type { TFunction } from '../../i18n';
import type { QuestShelfAchievementProgress } from '../../lib/questShelfAchievements';
import type { Game } from '../../types/game';

type ShelfProfilePopoverProps = {
  activeAchievement?: QuestShelfAchievementProgress | null;
  avatar: ReactNode;
  featuredGame?: Game | null;
  onOpenSettings: () => void;
  onOpenPlayingNow: () => void;
  playingNowGame?: Game | null;
  shelfName: string;
  shelfOverview: ShelfOverviewCounts;
  t: TFunction;
};

type ShelfOverviewCounts = {
  games: number;
  platforms: number;
  playing: number;
  queue: number;
};

type ShelfOverviewStat = {
  iconName: IconName;
  label: string;
  value: number;
};

export function ShelfProfilePopover({
  activeAchievement,
  avatar,
  featuredGame,
  onOpenSettings,
  onOpenPlayingNow,
  playingNowGame,
  shelfName,
  shelfOverview,
  t,
}: ShelfProfilePopoverProps) {
  return (
    <div
      className="absolute left-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-mint/25 bg-ink-950/95 p-3 text-slate-100 shadow-2xl shadow-black/50 backdrop-blur-xl max-h-[calc(100dvh-env(safe-area-inset-top,0px)-4rem)] overflow-y-auto overscroll-contain"
      role="menu"
    >
      <div className="flex min-w-0 items-center gap-3 border-b border-skyglass/15 pb-3">
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold uppercase tracking-caps text-mint">{shelfName}</div>
          <div className="mt-1 text-xs text-slate-500">{t('shelfProfile.title')}</div>
        </div>
      </div>

      <div className="space-y-2 border-b border-skyglass/15 py-3">
        <ShelfProfileRow
          iconName={activeAchievement?.icon ?? 'trophy'}
          label={t('shelfProfile.activeBadge')}
          value={activeAchievement?.title ?? t('shelfProfile.noActiveBadge')}
        />
        <ShelfProfileRow
          iconName="check-circle"
          label={t('shelfProfile.featuredGame')}
          value={featuredGame?.title ?? t('shelfProfile.noFeaturedGame')}
        />
        <button
          className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg border border-mint/20 bg-mint/10 px-2.5 py-2 text-left transition hover:bg-mint/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/70"
          onClick={onOpenPlayingNow}
          role="menuitem"
          type="button"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-mint/25 bg-mint/10 text-mint">
            <Icon name="gamepad-2" size={16} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block qs-label-caps text-muted">{t('playingNow.title')}</span>
            <span className="block truncate text-sm font-semibold text-slate-100" title={playingNowGame?.title ?? t('shelfProfile.openPlayingNowHub')}>{playingNowGame?.title ?? t('shelfProfile.openPlayingNowHub')}</span>
          </span>
          <span className="rounded-full border border-mint/25 bg-ink-950/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-mint">{shelfOverview.playing.toLocaleString()}</span>
        </button>
      </div>

      <ShelfOverviewSection overview={shelfOverview} t={t} />

      <div className="border-b border-skyglass/15 py-2">
        <button
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/70"
          onClick={onOpenSettings}
          role="menuitem"
          type="button"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-mint/25 bg-mint/10 text-mint">
            <Icon name="settings" size={16} strokeWidth={2.2} />
          </span>
          <span>{t('nav.settings')}</span>
        </button>
      </div>

    </div>
  );
}


function ShelfOverviewSection({ overview, t }: { overview: ShelfOverviewCounts; t: TFunction }) {
  const stats: ShelfOverviewStat[] = [
    { iconName: 'library', label: t('shelfProfile.games'), value: overview.games },
    { iconName: 'handheld', label: t('shelfProfile.platforms'), value: overview.platforms },
    { iconName: 'play-circle', label: t('shelfProfile.playing'), value: overview.playing },
    { iconName: 'list-ordered', label: t('shelfProfile.queue'), value: overview.queue },
  ];

  return (
    <section className="border-b border-skyglass/15 py-3" aria-label={t('shelfProfile.overview')}>
      <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-spread text-slate-500">
        <Icon name="layers" size={14} strokeWidth={2.2} />
        <span>{t('shelfProfile.overview')}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[340px]:grid-cols-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 items-center gap-2 rounded-lg border border-skyglass/10 bg-ink-900/55 px-2.5 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-mint/20 bg-mint/10 text-mint">
              <Icon name={stat.iconName} size={15} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate qs-label-caps text-muted">{stat.label}</span>
              <span className="block text-sm font-semibold tabular-nums text-slate-100">{stat.value.toLocaleString()}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShelfProfileRow({ iconName, label, value }: { iconName: IconName; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-skyglass/10 bg-ink-900/70 px-2.5 py-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-mint/20 bg-mint/10 text-mint">
        <Icon name={iconName} size={16} strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block qs-label-caps text-muted">{label}</span>
        <span className="block truncate text-sm font-semibold text-slate-100" title={value}>{value}</span>
      </span>
    </div>
  );
}
