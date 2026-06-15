import { useMemo } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { formatLocalDate, type PlayActivityRecord } from '../../lib/playActivityStorage';
import type { TFunction } from '../../i18n';
import type { Game, GamePlatform, GameStatus } from '../../types/game';

export type PlayingNowHubProps = {
  activity: PlayActivityRecord[];
  games: Game[];
  onBack: () => void;
  onOpenDetails: (gameId: string) => void;
  onPlayToday: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
};

type PlayingNowContext = {
  lastPlayedDate: string | null;
  playedDaysLast30: number;
  playedDaysLast7: number;
  playedToday: boolean;
  steamActivityLabel: string | null;
  steamActivityToday: boolean;
};

export function PlayingNowHub({ activity, games, onBack, onOpenDetails, onPlayToday, onStatusChange, t }: PlayingNowHubProps & { t: TFunction }) {
  const today = formatLocalDate(new Date());
  const playingGames = useMemo(
    () => games.filter((game) => game.collectionType === 'library' && game.status === 'Playing'),
    [games],
  );
  const groupedGames = useMemo(() => {
    const groups = new Map<GamePlatform, Game[]>();

    playingGames.forEach((game) => {
      const group = groups.get(game.platform) ?? [];
      group.push(game);
      groups.set(game.platform, group);
    });

    return Array.from(groups.entries())
      .sort(([platformA], [platformB]) => platformA.localeCompare(platformB))
      .map(([platform, platformGames]) => [platform, platformGames.sort((a, b) => a.title.localeCompare(b.title))] as const);
  }, [playingGames]);
  const activityByGame = useMemo(() => getPlayingNowContexts(playingGames, activity, today), [activity, playingGames, today]);

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 pb-8 text-slate-100" aria-labelledby="playing-now-title">
        <header className="qs-glass flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-mint">
              <Icon name="play-circle" size={14} strokeWidth={2.2} />
              <span>{t('playingNow.title')}</span>
            </div>
            <h2 id="playing-now-title" className="mt-1 text-2xl font-semibold text-white sm:text-3xl">{t('playingNow.title')}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-300">{playingGames.length} {playingGames.length === 1 ? t('playingNow.countSingular') : t('playingNow.countPlural')}</p>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">{t('playingNow.helper')}</p>
          </div>
          <button
            className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/70"
            onClick={onBack}
            type="button"
          >
            {t('action.back')}
          </button>
        </header>

        <div>
          {playingGames.length === 0 ? (
            <div className="qs-glass grid min-h-[55vh] place-items-center rounded-xl border p-8 text-center"><div>
              <Icon name="gamepad-2" size={32} className="mx-auto text-mint" strokeWidth={2} />
              <h3 className="mt-3 text-base font-semibold text-white">{t('playingNow.emptyTitle')}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">{t('playingNow.emptyText')}</p>
            </div></div>
          ) : (
            <div className="space-y-4">
              {groupedGames.map(([platform, platformGames]) => (
                <section key={platform} className="rounded-xl border border-skyglass/15 bg-ink-900/45 p-3 shadow-panel">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-mint/20 bg-mint/10 text-mint"><Icon name={getPlayingNowPlatformIcon(platform)} size={16} /></span>
                      <h3 className="truncate text-sm font-semibold uppercase tracking-[0.14em] text-slate-200" title={platform}>{platform}</h3>
                    </div>
                    <span className="rounded-full border border-skyglass/15 px-2 py-0.5 text-xs font-semibold text-slate-400">{platformGames.length}</span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3 lg:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] 2xl:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
                    {platformGames.map((game) => (
                      <PlayingNowCard
                        key={game.id}
                        context={activityByGame.get(game.id) ?? getEmptyPlayingNowContext(game, today)}
                        game={game}
                        onOpenDetails={onOpenDetails}
                        onPlayToday={onPlayToday}
                        onStatusChange={onStatusChange}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
  );
}

function getPlayingNowPlatformIcon(platform: GamePlatform): IconName {
  const normalizedPlatform = platform.toLowerCase();

  if (normalizedPlatform.includes('steam') || normalizedPlatform.includes('pc')) {
    return 'steam';
  }

  if (normalizedPlatform.includes('switch') || normalizedPlatform.includes('deck') || normalizedPlatform.includes('handheld') || normalizedPlatform.includes('portable')) {
    return 'handheld';
  }

  if (normalizedPlatform.includes('arcade') || normalizedPlatform.includes('retro')) {
    return 'joystick';
  }

  return 'gamepad-2';
}

function PlayingNowCard({ context, game, onOpenDetails, onPlayToday, onStatusChange }: { context: PlayingNowContext; game: Game; onOpenDetails: (gameId: string) => void; onPlayToday: (game: Game) => void; onStatusChange: (gameId: string, status: GameStatus) => void }) {
  return (
    <article className="flex h-full min-w-0 gap-3 rounded-xl border border-skyglass/15 bg-ink-950/70 p-3 shadow-lg shadow-black/20">
      <img className="h-28 w-20 shrink-0 rounded-lg border border-skyglass/15 object-cover bg-ink-900" src={game.coverImage} alt={`${game.title} cover`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-white" title={game.title}>{game.title}</h4>
            <p className="mt-1 text-xs font-medium text-slate-400">{game.platform}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${context.steamActivityToday || context.playedToday ? 'border-mint/30 bg-mint/10 text-mint' : 'border-skyglass/15 text-slate-400'}`}>{context.steamActivityToday ? 'Active Today' : context.playedToday ? 'Played today' : 'Not today'}</span>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Stat label="Last" value={context.lastPlayedDate ?? 'Never'} />
          <Stat label="7 days" value={String(context.playedDaysLast7)} />
          <Stat label="30 days" value={String(context.playedDaysLast30)} />
        </dl>
        {context.steamActivityLabel ? (
          <div className="mt-3 rounded-lg border border-mint/20 bg-mint/10 px-2.5 py-2 text-xs font-semibold text-mint">
            {context.steamActivityToday ? '✓ Steam activity detected today' : context.steamActivityLabel}
          </div>
        ) : null}
        {game.notes.trim() ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">{game.notes.trim()}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-md bg-mint px-3 py-1.5 text-xs font-semibold text-ink-950 shadow-glow transition hover:brightness-110" onClick={() => onPlayToday(game)} type="button">Play Today</button>
          <button className="rounded-md border border-skyglass/15 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-mint/10" onClick={() => onOpenDetails(game.id)} type="button">Open detail</button>
          <button className="rounded-md border border-skyglass/15 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-skyglass/10" onClick={() => onStatusChange(game.id, 'Paused')} type="button">Pause</button>
          <button className="rounded-md border border-skyglass/15 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-skyglass/10" onClick={() => onStatusChange(game.id, 'Finished')} type="button">Finished</button>
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-skyglass/10 bg-ink-900/70 px-2 py-1.5"><dt className="text-[0.6rem] uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="mt-0.5 font-semibold text-slate-100">{value}</dd></div>;
}

function getPlayingNowContexts(games: Game[], activity: PlayActivityRecord[], today: string) {
  const contexts = new Map<string, PlayingNowContext>();
  games.forEach((game) => contexts.set(game.id, getEmptyPlayingNowContext(game, today)));

  games.forEach((game) => {
    const dates = new Set(activity.filter((record) => record.gameId === game.id && record.action === 'played_today').map((record) => record.date));
    if (game.lastPlayedAt && /^\d{4}-\d{2}-\d{2}/.test(game.lastPlayedAt)) {
      dates.add(game.lastPlayedAt.slice(0, 10));
    }
    const sortedDates = Array.from(dates).sort();
    contexts.set(game.id, {
      lastPlayedDate: sortedDates.at(-1) ?? null,
      playedDaysLast30: countDatesSince(sortedDates, today, 30),
      playedDaysLast7: countDatesSince(sortedDates, today, 7),
      playedToday: dates.has(today),
      ...getSteamActivityContext(activity, game.id, today),
    });
  });

  return contexts;
}

function getEmptyPlayingNowContext(game: Game, today: string): PlayingNowContext {
  const lastPlayedDate = game.lastPlayedAt?.slice(0, 10) ?? null;
  const dates = lastPlayedDate ? [lastPlayedDate] : [];
  return {
    lastPlayedDate,
    playedDaysLast30: countDatesSince(dates, today, 30),
    playedDaysLast7: countDatesSince(dates, today, 7),
    playedToday: lastPlayedDate === today,
    steamActivityLabel: getSteamActivityLabel(game.lastSteamActivityAt, today),
    steamActivityToday: game.lastSteamActivityAt?.slice(0, 10) === today,
  };
}


function getSteamActivityContext(activity: PlayActivityRecord[], gameId: string, today: string) {
  const latestSteamActivity = activity
    .filter((record) => record.gameId === gameId && record.source === 'steam' && record.type === 'playtime_delta')
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))[0];

  return {
    steamActivityLabel: getSteamActivityLabel(latestSteamActivity?.detectedAt, today),
    steamActivityToday: latestSteamActivity?.date === today,
  };
}

function getSteamActivityLabel(detectedAt: string | undefined, today: string) {
  if (!detectedAt) {
    return null;
  }

  const date = detectedAt.slice(0, 10);
  const todayTime = new Date(`${today}T00:00:00`).getTime();
  const activityTime = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(activityTime)) {
    return null;
  }

  const diffDays = Math.round((todayTime - activityTime) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) {
    return 'Active Today';
  }
  if (diffDays === 1) {
    return 'Active Yesterday';
  }
  if (diffDays >= 0 && diffDays < 7) {
    return 'Active This Week';
  }
  return null;
}

function countDatesSince(dates: string[], today: string, days: number) {
  const todayTime = new Date(`${today}T00:00:00`).getTime();
  const earliestTime = todayTime - (days - 1) * 24 * 60 * 60 * 1000;
  return dates.filter((date) => {
    const dateTime = new Date(`${date}T00:00:00`).getTime();
    return Number.isFinite(dateTime) && dateTime >= earliestTime && dateTime <= todayTime;
  }).length;
}

