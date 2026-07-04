import { useMemo } from 'react';
import { useI18n, type TFunction } from '../i18n';
import type { Game, SteamAchievement } from '../types/game';
import { Icon } from './Icon';

const SHOWCASE_SIZE = 8;

type RecentAchievement = {
  achievement: SteamAchievement;
  gameTitle: string;
};

type HomeSteamAchievementsWidgetProps = {
  games: Game[];
  isSteamAchievementSyncing?: boolean;
  onSyncSteamAchievements?: () => void;
  onOpenTimeline?: () => void;
};

export function HomeSteamAchievementsWidget({
  games,
  isSteamAchievementSyncing = false,
  onSyncSteamAchievements,
  onOpenTimeline,
}: HomeSteamAchievementsWidgetProps) {
  const { t } = useI18n();

  const steamLibraryGames = useMemo(
    () => games.filter((g) => g.collectionType === 'library' && typeof g.steamAppId === 'number'),
    [games],
  );

  const hasDetailData = useMemo(
    () => steamLibraryGames.some((g) => Array.isArray(g.steamAchievements)),
    [steamLibraryGames],
  );

  const recent = useMemo(() => selectRecentUnlocked(steamLibraryGames), [steamLibraryGames]);

  // No Steam games at all — don't show the widget, but only after every hook above
  // has been called so React hook order stays stable as imports complete.
  if (steamLibraryGames.length === 0) return null;

  return (
    <section className="qs-home-section rounded-2xl border border-skyglass/15 bg-ink-900/74 shadow-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="steam" size={15} className="shrink-0 text-slate-400" />
          <h3 className="qs-home-section-title text-lg font-semibold text-white">{t('home.steamAchievements')}</h3>
        </div>
        <div className="flex items-center gap-2">
          {onOpenTimeline && recent.length > 0 ? (
            <button
              className="qs-home-section-action min-h-10 rounded-lg border border-skyglass/15 px-3 qs-label-caps text-slate-400 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white"
              type="button"
              onClick={onOpenTimeline}
            >
              Timeline
            </button>
          ) : null}
          {onSyncSteamAchievements ? (
            <button
              className="qs-home-section-action min-h-10 rounded-lg border border-skyglass/15 px-3 qs-label-caps text-slate-300 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSteamAchievementSyncing}
              type="button"
              onClick={onSyncSteamAchievements}
            >
              {isSteamAchievementSyncing ? t('home.steamAchievementsSyncing') : t('home.steamAchievementsSync')}
            </button>
          ) : null}
        </div>
      </div>

      {isSteamAchievementSyncing ? (
        <p className="text-sm text-slate-500">{t('home.steamAchievementsSyncing')}</p>
      ) : recent.length > 0 ? (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {recent.map(({ achievement, gameTitle }) => (
            <RecentAchievementCard
              key={`${gameTitle}:${achievement.apiName}`}
              achievement={achievement}
              t={t}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {hasDetailData ? t('home.steamAchievementsEmpty') : t('home.steamAchievementsNoData')}
        </p>
      )}
    </section>
  );
}

function RecentAchievementCard({
  achievement,
  t,
}: {
  achievement: SteamAchievement;
  t: TFunction;
}) {
  const unlockDate = achievement.unlockTime
    ? new Date(achievement.unlockTime * 1000).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="qs-achievement-card qs-achievement-card--unlocked flex w-36 shrink-0 flex-col gap-2 p-3">
      {achievement.iconUrl ? (
        <img
          alt=""
          aria-hidden="true"
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
          loading="lazy"
          src={achievement.iconUrl}
        />
      ) : (
        <div className="qs-achievement-card__icon">
          <Icon name="trophy" size={22} />
        </div>
      )}

      <p className="line-clamp-3 flex-1 text-xs font-semibold leading-tight text-white">
        {achievement.displayName}
      </p>

      {unlockDate ? (
        <p className="text-2xs text-mint/70">{unlockDate}</p>
      ) : (
        <span className="qs-achievement-card__progress self-start">
          {t('home.qsAchievementsUnlocked')}
        </span>
      )}
    </div>
  );
}

function selectRecentUnlocked(steamGames: Game[]): RecentAchievement[] {
  const result: RecentAchievement[] = [];

  for (const game of steamGames) {
    if (!Array.isArray(game.steamAchievements)) continue;
    for (const achievement of game.steamAchievements) {
      if (!achievement || typeof achievement !== 'object') continue;
      if (!achievement.unlocked || typeof achievement.apiName !== 'string' || typeof achievement.displayName !== 'string') continue;
      result.push({ achievement, gameTitle: game.title });
    }
  }

  result.sort((a, b) => {
    const tA = a.achievement.unlockTime ?? 0;
    const tB = b.achievement.unlockTime ?? 0;
    return tB - tA;
  });

  return result.slice(0, SHOWCASE_SIZE);
}
