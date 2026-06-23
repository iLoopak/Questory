import { useMemo } from 'react';
import { useI18n, type TFunction } from '../i18n';
import { hasSteamAchievementSummary } from '../lib/steamAchievementSummary';
import type { Game } from '../types/game';
import { Icon } from './Icon';

const WIDGET_SIZE = 4;

type HomeSteamAchievementsWidgetProps = {
  games: Game[];
  isSteamAchievementSyncing?: boolean;
  onSyncSteamAchievements?: () => void;
};

export function HomeSteamAchievementsWidget({
  games,
  isSteamAchievementSyncing = false,
  onSyncSteamAchievements,
}: HomeSteamAchievementsWidgetProps) {
  const { t } = useI18n();

  const steamLibraryGames = useMemo(
    () => games.filter((g) => g.collectionType === 'library' && typeof g.steamAppId === 'number'),
    [games],
  );

  const featured = useMemo(() => selectFeatured(steamLibraryGames), [steamLibraryGames]);

  // No Steam games at all — don't clutter Home
  if (steamLibraryGames.length === 0) return null;

  const hasData = featured.length > 0;

  return (
    <section className="qs-home-section rounded-2xl border border-skyglass/15 bg-ink-900/74 shadow-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="steam" size={15} className="shrink-0 text-slate-400" />
          <h3 className="qs-home-section-title text-lg font-semibold text-white">{t('home.steamAchievements')}</h3>
        </div>
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

      {hasData ? (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {featured.map((game) => (
            <SteamGameAchievementCard key={game.id} game={game} t={t} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t('home.steamAchievementsEmpty')}</p>
      )}
    </section>
  );
}

function SteamGameAchievementCard({ game, t }: { game: Game; t: TFunction }) {
  const hasAchievements = hasSteamAchievementSummary(game);
  const isUnsupported = game.steamAchievementsUnsupported === true;
  const percent = game.steamAchievementsPercent ?? 0;
  const unlocked = game.steamAchievementsUnlocked ?? 0;
  const total = game.steamAchievementsTotal ?? 0;

  return (
    <div
      className={`qs-achievement-card flex w-36 shrink-0 flex-col gap-2 p-3 ${
        percent === 100 ? 'qs-achievement-card--unlocked' : 'qs-achievement-card--locked'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        {game.coverImage ? (
          <img
            alt=""
            aria-hidden="true"
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
            src={game.coverImage}
          />
        ) : (
          <div className="qs-achievement-card__icon">
            <Icon name="steam" size={18} />
          </div>
        )}
        {percent === 100 ? (
          <Icon name="check-circle" size={13} className="mt-0.5 shrink-0 text-mint" />
        ) : null}
      </div>

      <p className="line-clamp-2 flex-1 text-xs font-semibold leading-tight text-white">{game.title}</p>

      {isUnsupported && !hasAchievements ? (
        <span className="text-2xs text-slate-600">{t('home.steamAchievementsUnavailable')}</span>
      ) : hasAchievements ? (
        <div className="space-y-1">
          <span className="text-2xs text-slate-400">
            {unlocked} / {total}
          </span>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-mint/60 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : (
        <span className="text-2xs text-slate-600">{t('home.steamAchievementsEmpty')}</span>
      )}
    </div>
  );
}

function selectFeatured(steamGames: Game[]): Game[] {
  const withData = steamGames.filter(hasSteamAchievementSummary);

  if (withData.length === 0) return [];

  return withData
    .slice()
    .sort((a, b) => {
      // Playing first
      const aPlaying = a.status === 'Playing' ? 0 : 1;
      const bPlaying = b.status === 'Playing' ? 0 : 1;
      if (aPlaying !== bPlaying) return aPlaying - bPlaying;

      // Then by last played descending
      const aTime = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0;
      const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;

      // Then by completion percent descending (show closest to done)
      return (b.steamAchievementsPercent ?? 0) - (a.steamAchievementsPercent ?? 0);
    })
    .slice(0, WIDGET_SIZE);
}
