import { getPreferredArtworkSources, getPreferredLogoUrl } from '../../lib/gameCoverImages';
import { GameCoverImage } from '../GameCoverImage';
import { PlatformIdentityBadge } from '../PlatformIdentityBadge';
import { hasSteamAchievementSummary } from '../../lib/steamAchievementSummary';
import type { PlatformQueueState } from '../../lib/platformQueueStorage';
import type { Game, GamePlatform } from '../../types/game';
import { useI18n } from '../../i18n';

function getGamePlatformLabel(game: Game, queueState: PlatformQueueState): GamePlatform {
  return queueState.entries.find((entry) => entry.gameId === game.id)?.targetPlatform ?? game.platform;
}

function formatPlaytimeHours(hours: number): string {
  if (hours < 1) return '<1h';
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? Math.round(rounded) : rounded}h`;
}

function formatHomeAchievementProgress(game: Game): string | null {
  if (!hasSteamAchievementSummary(game)) return null;
  return `${game.steamAchievementsUnlocked}/${game.steamAchievementsTotal} achievements`;
}

export function GamePosterButton({
  game,
  eyebrow,
  hero = false,
  onClick,
  queueState,
  activitySignal = null,
}: {
  game: Game;
  eyebrow?: string;
  hero?: boolean;
  onClick: () => void;
  queueState: PlatformQueueState;
  activitySignal?: string | null;
}) {
  const { t } = useI18n();
  const ambientSource = getPreferredArtworkSources(game, 'landscape')[0] ?? null;
  const logoUrl = getPreferredLogoUrl(game);
  const platform = getGamePlatformLabel(game, queueState);
  const playtime = game.playtimeHours > 0 ? `${platform} playtime: ${formatPlaytimeHours(game.playtimeHours)}` : null;
  const achievementSummary = formatHomeAchievementProgress(game);

  return (
    <button
      className={`group relative flex w-full gap-4 overflow-hidden rounded-2xl border border-mint/25 bg-gradient-to-br from-mint/[0.12] via-ink-950 to-ink-950 p-3.5 text-left shadow-panel ring-1 ring-mint/10 transition hover:-translate-y-0.5 hover:border-mint/55 hover:bg-mint/[0.08] hover:shadow-glow focus-visible:border-mint/70 focus-visible:ring-2 focus-visible:ring-mint/40 ${hero ? 'min-h-[9.5rem] sm:p-4' : 'min-h-[8rem]'}`}
      data-home-focus="true"
      onClick={onClick}
      type="button"
    >
      {/* Ambient background — landscape/hero art at low opacity for depth */}
      {ambientSource ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <img
            alt=""
            className="h-full w-full scale-105 object-cover opacity-[0.16] blur-sm transition group-hover:opacity-[0.22]"
            decoding="async"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            src={ambientSource}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/92 via-ink-950/78 to-ink-950/52" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-mint/[0.10] to-transparent" />
        </div>
      ) : null}

      {/* Portrait cover */}
      <span className={`relative shrink-0 overflow-hidden rounded-xl border border-mint/25 bg-ink-800 shadow-lg transition group-hover:border-mint/45 ${hero ? 'h-32 w-24 sm:h-36 sm:w-28' : 'h-28 w-20'}`}>
        <GameCoverImage className="h-full w-full object-cover" decoding="async" game={game} loading="lazy" />
      </span>

      {/* Text + metadata */}
      <div className="relative flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <PlatformIdentityBadge
              className="w-fit rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm"
              platform={platform}
              queueState={queueState}
            />
            {eyebrow ? (
              <span className="inline-flex w-fit items-center rounded-full border border-mint/30 bg-ink-950/78 px-2.5 py-1 qs-label-caps text-accent">
                {eyebrow}
              </span>
            ) : null}
          </div>
          {logoUrl ? (
            <img
              alt=""
              aria-hidden="true"
              className="mb-1.5 block max-h-7 max-w-[140px] object-contain object-left drop-shadow"
              decoding="async"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              src={logoUrl}
            />
          ) : null}
          <span className={`line-clamp-2 block font-bold leading-tight text-white drop-shadow ${hero ? 'text-xl sm:text-2xl' : 'text-base'}`}>
            {game.title}
          </span>
        </div>
        <div className="min-w-0">
          <div className="grid gap-1.5 text-xs text-slate-300">
            {activitySignal ? <span className="font-medium text-slate-200">{activitySignal}</span> : null}
            {playtime ? <span>{playtime}</span> : null}
            {achievementSummary ? <span>{achievementSummary}</span> : null}
          </div>
          <span className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-mint px-4 text-sm font-bold text-ink-950 shadow-glow transition group-hover:bg-mint/90">
            {t('home.openDetails')}
          </span>
        </div>
      </div>
    </button>
  );
}
