import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Game } from '../../types/game';
import { getGameCoverSources, isMissingOrGeneratedCover } from '../../lib/gameCoverImages';
import { getArtworkSet } from '../../lib/gameSelectors';
import { useCoverImageLoaded } from '../../hooks/useCoverImageLoaded';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import { getDisplayTitle } from '../../lib/gameEditPatch';

// The display-title rule now lives with the edit patch contract, which has to agree with it when it
// decides whether a corrected title still needs an override. Re-exported so the components that
// already import it from the hero keep working.
export { getDisplayTitle };

export function HeroStat({ accent, label, onClick, value }: { accent?: boolean; label: string; onClick?: () => void; value: string }) {
  const className = `rounded-xl border px-2.5 py-2 text-left ${accent ? 'border-mint/30 bg-mint/10' : 'border-white/10 bg-ink-900/80'} ${onClick ? 'cursor-pointer transition hover:border-mint/40 hover:bg-mint/5 active:scale-[0.98]' : ''}`;
  const content = (
    <>
      <div className="qs-label-caps truncate text-muted">{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold ${accent ? 'text-mint' : 'text-slate-100'}`}>{value}</div>
    </>
  );
  return onClick ? (
    <button className={className} type="button" onClick={onClick}>{content}</button>
  ) : (
    <div className={className}>{content}</div>
  );
}

type GameHeroProps = {
  game: Game;
  /** Small caps label above the title, e.g. "Game dashboard" or "Discovery Preview". */
  kicker: string;
  onBack: () => void;
  /** HeroStat elements rendered in the stat grid below the title. */
  stats?: ReactNode;
};

/**
 * Canonical Game page hero — cover, background artwork with veils, back
 * button, kicker, logo, title and stat grid. Shared by the Library Game Hub
 * and Discovery Preview so both modes present games identically.
 */
export function GameHero({ game, kicker, onBack, stats }: GameHeroProps) {
  const { t } = useI18n();
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [heroBgSourceIndex, setHeroBgSourceIndex] = useState(0);

  const artworkSet = useMemo(() => getArtworkSet(game), [game]);
  const coverSources = useMemo(() => getGameCoverSources(game), [game]);

  const heroBgSources = useMemo(() => {
    const candidates = [
      artworkSet.hero?.trim(),
      artworkSet.wideCover?.trim(),
      artworkSet.background?.trim(),
      !isMissingOrGeneratedCover(artworkSet.cover) ? artworkSet.cover.trim() : null,
    ].filter((s): s is string => Boolean(s));
    return [...new Set(candidates)];
  }, [artworkSet]);

  useEffect(() => {
    setCoverSourceIndex(0);
    setHeroBgSourceIndex(0);
  }, [coverSources, heroBgSources, game.id]);

  const activeCoverSource = coverSources[coverSourceIndex] ?? null;
  const { imgRef: coverImgRef, isLoaded: isCoverLoaded, markBroken: markCoverBroken, markLoaded: markCoverLoaded } = useCoverImageLoaded(activeCoverSource);
  const activeHeroBgSource = heroBgSources[heroBgSourceIndex] ?? null;
  const logoUrl = artworkSet.logo?.trim() || null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-panel">
      {activeHeroBgSource ? (
        <div className="absolute inset-0" aria-hidden="true">
          <img
            alt=""
            className="h-full w-full object-cover opacity-[0.85]"
            decoding="async"
            loading="lazy"
            onError={() => setHeroBgSourceIndex((i) => i + 1)}
            src={activeHeroBgSource}
          />
        </div>
      ) : null}
      {/* Left-to-right veil: solid over cover/title area, fades to ~25% on far right so hero is clearly visible */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/75 to-ink-950/25" aria-hidden="true" />
      {/* Bottom vignette: light darkening only where stat cards sit */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/50 to-transparent" aria-hidden="true" />

      <div className="relative grid gap-4 p-4 sm:grid-cols-[132px_minmax(0,1fr)] sm:items-center xl:grid-cols-[150px_minmax(0,1fr)] xl:p-5">
        <div className="mx-auto w-32 overflow-hidden rounded-xl border border-white/10 bg-ink-800 shadow-panel sm:mx-0 sm:w-full">
          <div className="aspect-[2/3] bg-ink-700">
            {activeCoverSource ? (
              <div className="relative h-full">
                {!isCoverLoaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
                <img
                  alt=""
                  className={`h-full w-full bg-ink-950 object-contain transition-opacity duration-300 ${
                    isCoverLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  decoding="async"
                  loading="lazy"
                  onError={() => {
                    markCoverBroken();
                    setCoverSourceIndex((currentIndex) => Math.min(currentIndex + 1, coverSources.length - 1));
                  }}
                  onLoad={markCoverLoaded}
                  ref={coverImgRef}
                  src={activeCoverSource}
                />
              </div>
            ) : (
              <div className="grid h-full place-items-center bg-ink-700 px-4 text-center">
                <div>
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-md border border-white/10 bg-ink-900 text-2xl font-semibold text-mint">
                    {game.title.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="mt-3 text-xs font-medium uppercase tracking-caps text-slate-500">{t('common.noCover')}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <button className="inline-flex items-center gap-1.5 text-sm font-medium text-mint transition hover:text-white" onClick={onBack} type="button">
            <Icon name="arrow-left" />
            <span>{t('detail.back')}</span>
          </button>
          <div>
            <div className="text-xs font-semibold uppercase tracking-spread text-slate-500">{kicker}</div>
            {logoUrl ? (
              <img
                alt=""
                aria-hidden="true"
                className="mt-2 max-h-12 max-w-[180px] object-contain drop-shadow"
                decoding="async"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                src={logoUrl}
              />
            ) : null}
            <h2 className="mt-1 min-w-0 text-3xl font-semibold leading-tight text-white sm:text-4xl xl:truncate">{getDisplayTitle(game)}</h2>
          </div>

          {stats ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(6.75rem,1fr))] gap-1.5 xl:max-w-4xl">
              {stats}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
