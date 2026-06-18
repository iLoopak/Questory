import { useEffect, useMemo, useRef } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { formatLocalDate, type PlayActivityRecord } from '../../lib/playActivityStorage';
import { useI18n, type TFunction } from '../../i18n';
import type { PlatformQueueState, PlatformQueueSummary } from '../../lib/platformQueueStorage';
import type { Game, GamePlatform, GameStatus } from '../../types/game';
import { getContextualGreeting } from './contextualGreetings';
import { createPlayingNowGreeting } from './playingNowGreeting';

export type PlayingNowHubProps = {
  activity: PlayActivityRecord[];
  featuredGame?: Game | null;
  games: Game[];
  onBack: () => void;
  onOpenDetails: (gameId: string) => void;
  onPlayToday: (game: Game) => void;
  onRefreshSteamActivity?: (gameIds: string[]) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  queue?: PlatformQueueState | null;
  queueSummary?: PlatformQueueSummary | null;
  shelfNickname?: string;
};

type PlayingNowContext = {
  lastPlayedDate: string | null;
  playedDaysLast30: number;
  playedDaysLast7: number;
  playedToday: boolean;
  steamActivityLabel: string | null;
  steamActivityToday: boolean;
};

export function PlayingNowHub({ activity, featuredGame, games, onBack, onOpenDetails, onPlayToday, onRefreshSteamActivity, onStatusChange, queue, queueSummary, shelfNickname, t }: PlayingNowHubProps & { t: TFunction }) {
  const { language } = useI18n();
  const today = formatLocalDate(new Date());
  const greetingSeedRef = useRef(`${Date.now()}-${Math.random()}`);
  const previousGreetingSubtextRef = useRef(readLastPlayingNowGreetingSubtext());
  const playingGames = useMemo(
    () => games.filter((game) => game.collectionType === 'library' && game.status === 'Playing'),
    [games],
  );
  const refreshKeyRef = useRef<string | null>(null);
  const groupedGames = useMemo(() => {
    const groups = new Map<GamePlatform, Game[]>();

    playingGames.forEach((game) => {
      const group = groups.get(game.platform) ?? [];
      group.push(game);
      groups.set(game.platform, group);
    });

    const activePlatforms = queue?.activePlatforms ?? [];

    return Array.from(groups.entries())
      .sort(([platformA], [platformB]) => {
        const indexA = activePlatforms.indexOf(platformA);
        const indexB = activePlatforms.indexOf(platformB);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return platformA.localeCompare(platformB);
      })
      .map(([platform, platformGames]) => [platform, platformGames.sort((a, b) => a.title.localeCompare(b.title))] as const);
  }, [playingGames, queue?.activePlatforms]);
  const activityByGame = useMemo(() => getPlayingNowContexts(playingGames, activity, today), [activity, playingGames, today]);

  useEffect(() => {
    if (!onRefreshSteamActivity) return;
    const refreshableGameIds = playingGames.filter(isVisiblePlayingSteamGame).map((game) => game.id).sort();
    const refreshKey = refreshableGameIds.join('|');
    if (!refreshKey || refreshKeyRef.current === refreshKey) return;
    refreshKeyRef.current = refreshKey;
    window.setTimeout(() => onRefreshSteamActivity(refreshableGameIds), 0);
  }, [onRefreshSteamActivity, playingGames]);
  const contextualGreeting = useMemo(() => getContextualGreeting({ activity, games, language, playingNowGames: playingGames, previousSubtext: previousGreetingSubtextRef.current, queue, seed: greetingSeedRef.current, shelfIdentity: shelfNickname, shelfStats: queueSummary }), [activity, games, language, playingGames, queue, queueSummary, shelfNickname]);
  const greeting = useMemo(() => createPlayingNowGreeting({ contextualGreeting, language, nickname: shelfNickname }), [contextualGreeting, language, shelfNickname]);

  useEffect(() => {
    if (contextualGreeting?.subtext) writeLastPlayingNowGreetingSubtext(contextualGreeting.subtext);
  }, [contextualGreeting]);
  const platformCount = groupedGames.length;
  const metaLine = `${playingGames.length} ${playingGames.length === 1 ? t('playingNow.countSingular') : t('playingNow.countPlural')} • ${platformCount} ${platformCount === 1 ? t('playingNow.platformSingular') : t('playingNow.platformPlural')}`;

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 pb-8 text-slate-100" aria-labelledby="playing-now-title">
        <header className="qs-glass flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-mint">
              <Icon name="play-circle" size={14} strokeWidth={2.2} />
              <span>{t('playingNow.title')}</span>
            </div>
            <h2 id="playing-now-title" className="mt-1 text-2xl font-semibold text-white sm:text-3xl">{greeting.headline}</h2>
            {greeting.subtext ? <p className="mt-1 max-w-2xl text-sm text-slate-300">{greeting.subtext}</p> : null}
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{metaLine}</p>
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
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-2.5 lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] 2xl:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
                    {platformGames.map((game) => (
                      <PlayingNowCard
                        key={game.id}
                        context={activityByGame.get(game.id) ?? getEmptyPlayingNowContext(game, today)}
                        game={game}
                        onOpenDetails={onOpenDetails}
                        onPlayToday={onPlayToday}
                        onStatusChange={onStatusChange}
                        t={t}
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

function PlayingNowCard({ context, game, onOpenDetails, onPlayToday, onStatusChange, t }: { context: PlayingNowContext; game: Game; onOpenDetails: (gameId: string) => void; onPlayToday: (game: Game) => void; onStatusChange: (gameId: string, status: GameStatus) => void; t: TFunction }) {
  const statusBadge = getPlayingNowStatusBadge(context, t);

  return (
    <article className="flex h-full min-w-0 gap-2.5 rounded-xl border border-skyglass/15 bg-ink-950/70 p-2.5 shadow-lg shadow-black/20">
      <img className="h-24 w-16 shrink-0 rounded-lg border border-skyglass/15 bg-ink-900 object-cover" src={game.coverImage} alt={`${game.title} cover`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-white" title={game.title}>{game.title}</h4>
          <p className="mt-0.5 truncate text-[0.7rem] font-medium text-slate-400" title={game.platform}>{game.platform}</p>
        </div>
        <span className={`mt-2 w-fit rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold ${statusBadge.tone}`}>{statusBadge.label}</span>
        <div className="mt-auto flex items-center gap-2 pt-3">
          <button className="min-h-8 flex-1 rounded-md bg-mint px-2.5 py-1.5 text-xs font-semibold text-ink-950 shadow-glow transition hover:brightness-110" onClick={() => onPlayToday(game)} type="button">{t('playingNow.playToday')}</button>
          <details className="group relative shrink-0">
            <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-md border border-skyglass/15 text-slate-200 transition hover:bg-mint/10 hover:text-white" aria-label={t('action.moreActions')}>
              <Icon name="more-horizontal" size={16} strokeWidth={2.2} />
            </summary>
            <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-mint/25 bg-ink-950/95 p-2 text-slate-100 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <div className="mb-2 grid grid-cols-3 gap-1 border-b border-skyglass/10 pb-2 text-center text-[0.65rem]">
                <Metric label={t('playingNow.last')} value={context.lastPlayedDate ?? t('playingNow.never')} />
                <Metric label={t('playingNow.days7')} value={String(context.playedDaysLast7)} />
                <Metric label={t('playingNow.days30')} value={String(context.playedDaysLast30)} />
              </div>
              <OverflowAction icon="panel-top-open" label={t('playingNow.openDetail')} onClick={() => onOpenDetails(game.id)} />
              <OverflowAction icon="x" label={t('status.paused')} onClick={() => onStatusChange(game.id, 'Paused')} />
              <OverflowAction icon="check-circle" label={t('action.finished')} onClick={() => onStatusChange(game.id, 'Finished')} />
              <OverflowAction icon="archive" label={t('queue.removeFromPlaying')} onClick={() => onStatusChange(game.id, 'Want to play')} />
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

function getPlayingNowStatusBadge(context: PlayingNowContext, t: TFunction) {
  const activeTone = 'border-mint/30 bg-mint/10 text-mint';
  if (context.playedToday) return { label: t('playingNow.playedToday'), tone: activeTone };
  if (context.steamActivityToday) return { label: t('playingNow.activeToday'), tone: activeTone };
  if (context.steamActivityLabel === 'Active This Week' || context.steamActivityLabel === 'Active Yesterday') return { label: t('playingNow.activeThisWeek'), tone: 'border-sky-300/25 bg-sky-300/10 text-sky-200' };
  return { label: t('playingNow.idle'), tone: 'border-skyglass/15 text-slate-400' };
}

function OverflowAction({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white" onClick={onClick} type="button">
      <Icon name={icon} size={14} strokeWidth={2.2} />
      <span>{label}</span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="truncate font-semibold text-slate-200" title={value}>{value}</div></div>;
}

function isVisiblePlayingSteamGame(game: Game) {
  return game.collectionType === 'library' && game.status === 'Playing' && (game.externalSource === 'steam' || typeof game.steamAppId === 'number' || game.platform.toLowerCase().includes('steam'));
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

const lastPlayingNowGreetingSubtextKey = 'questshelf.playingNow.lastContextualSubtext';

function readLastPlayingNowGreetingSubtext() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(lastPlayingNowGreetingSubtextKey);
  } catch {
    return null;
  }
}

function writeLastPlayingNowGreetingSubtext(subtext: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(lastPlayingNowGreetingSubtextKey, subtext);
  } catch {
    // Storage can be unavailable in restricted browser contexts; greeting selection still works without repeat memory.
  }
}
