import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types/game';
import type { RawgGameDetails } from '../../types/rawg';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { getGameDetails } from '../../services/rawgApi';
import { useI18n } from '../../i18n';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useDiscoveryScreenshots } from '../../hooks/useDiscoveryScreenshots';
import { GameHero, HeroStat } from '../game-detail/GameHero';
import { DetailSection } from '../game-detail/DetailSection';
import { GameDetailActionBar, GameDetailActionButton, type GameDetailAction } from '../game-detail/GameDetailActions';
import { GameInformationSection, formatMetacriticScore, formatRawgPlaytime } from '../game-detail/GameInformationSection';
import { DiscoveryScreenshotStrip } from '../ScreenshotStrip';
import { ContextualRecommendationsSection } from './ContextualRecommendationsSection';

type Props = {
  candidate: DiscoveryCandidate;
  userGames: Game[];
  discoveryInboxRawgIds: Set<number>;
  onClose: () => void;
  onAddToInbox: (game: DiscoveryGame, reason: string) => void;
  onAddToWishlist: (game: DiscoveryGame) => void;
  onAddToLibrary: (game: DiscoveryGame) => void;
  /** Switch the preview to another discovery candidate (recommendation carousel). */
  onOpenPreview?: (candidate: DiscoveryCandidate) => void;
  /** Open the Game Hub for a game that is already in the user's collection. */
  onOpenLibraryGame?: (game: DiscoveryGame) => void;
};

/**
 * Discovery Preview — the "Do I want this game?" mode of the Game page.
 *
 * Reuses the canonical Game Hub building blocks (GameHero, GameDetailActionBar,
 * DetailSection, GameInformationSection, recommendation carousel) so Preview
 * and Hub read as two modes of the same page, not two designs.
 */
export function DiscoveryPreviewPanel({
  candidate,
  userGames,
  discoveryInboxRawgIds,
  onClose,
  onAddToInbox,
  onAddToWishlist,
  onAddToLibrary,
  onOpenPreview,
  onOpenLibraryGame,
}: Props) {
  const { t } = useI18n();
  const { game, reason } = candidate;
  const [details, setDetails] = useState<RawgGameDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { screenshots, loading: screenshotsLoading } = useDiscoveryScreenshots(game.rawgId);

  useScrollLock();
  const { handleTrapKeyDown } = useFocusTrap(dialogRef);

  // Real-time collection status (reacts to changes while the panel is open).
  const realMatch = userGames.find((g) => g.rawgId === game.rawgId);
  const isInLibrary = realMatch?.collectionType === 'library';
  const isInWishlist = realMatch?.collectionType === 'wishlist';
  const isInInbox = discoveryInboxRawgIds.has(game.rawgId);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setDetails(null);
    scrollRef.current?.scrollTo({ top: 0 });
    // When the preview swaps to another candidate in place (recommendation
    // carousel), the previously focused card is gone — re-anchor focus.
    dialogRef.current?.focus({ preventScroll: true });

    getGameDetails(game.rawgId)
      .then((d) => {
        if (cancelled) return;
        setDetails(d);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [game.rawgId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Synthetic Game so the shared Game Hub components can render discovery
  // data without a library record ever being created.
  const previewGame: Game = useMemo(() => ({
    id: `preview-${game.rawgId}`,
    title: game.title,
    platform: game.hasSteamVersion ? 'Steam' : (game.platforms[0] ?? 'PC'),
    status: 'Want to play',
    coverImage: game.coverUrl ?? '',
    backgroundImage: details?.background_image ?? game.coverUrl ?? null,
    playtimeHours: 0,
    tags: [],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
    rawgId: game.rawgId,
    rawgSlug: game.slug ?? undefined,
    genres: game.genres,
    metacritic: game.metacritic ?? null,
    released: game.released,
    developers: details?.developers?.map((d) => d.name),
    publishers: details?.publishers?.map((p) => p.name),
    averagePlaytime: details?.playtime,
    rawgTags: game.tags,
  }), [game, details]);

  const metacriticScore = formatMetacriticScore(game.metacritic);
  const rawgPlaytime = formatRawgPlaytime(details?.playtime);
  const releaseYear = game.released ? game.released.slice(0, 4) : null;
  const description = details?.description_raw?.trim();

  const collectionStatus = isInLibrary
    ? 'In Library'
    : isInWishlist
      ? 'In Wishlist'
      : isInInbox
        ? 'In Discovery Inbox'
        : 'Not in library yet';

  const previewActions: GameDetailAction[] = isInLibrary
    ? [
        {
          icon: 'gamepad-2',
          label: 'Open Game Hub',
          onClick: () => onOpenLibraryGame?.(game),
          tone: 'accent',
          disabled: !onOpenLibraryGame,
        },
      ]
    : isInWishlist
      ? [
          {
            icon: 'library',
            label: 'Move to Library',
            onClick: () => onAddToLibrary(game),
            tone: 'accent',
          },
          {
            icon: 'heart',
            label: 'In your Wishlist',
            onClick: () => {},
            tone: 'neutral',
            disabled: true,
          },
        ]
      : [
          isInInbox
            ? {
                icon: 'check' as const,
                label: 'In Discovery Inbox',
                onClick: () => {},
                tone: 'neutral' as const,
                disabled: true,
              }
            : {
                icon: 'list-plus' as const,
                label: 'Review Later',
                onClick: () => onAddToInbox(game, reason ?? ''),
                tone: 'accent' as const,
              },
          {
            icon: 'heart',
            label: 'Add to Wishlist',
            onClick: () => onAddToWishlist(game),
            tone: 'neutral',
          },
          {
            icon: 'library',
            label: 'Add to Library',
            onClick: () => onAddToLibrary(game),
            tone: 'accent',
          },
        ];

  return (
    <div
      ref={dialogRef}
      aria-label={`Preview: ${game.title}`}
      aria-modal="true"
      className="fixed inset-0 z-50 bg-ink-950"
      onKeyDown={handleTrapKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4">
        <div className="mx-auto max-w-6xl space-y-3 sm:space-y-4">
          <GameHero
            game={previewGame}
            kicker="Discovery Preview"
            onBack={onClose}
            stats={<>
              <HeroStat label={t('detail.platformSource')} value={previewGame.platform} />
              <HeroStat label={t('detail.currentStatus')} value={collectionStatus} accent={isInLibrary || isInWishlist} />
              {releaseYear ? <HeroStat label="Released" value={releaseYear} /> : null}
              {metacriticScore ? <HeroStat label="Metacritic" value={metacriticScore} /> : null}
              {rawgPlaytime ? <HeroStat label="Average playtime" value={rawgPlaytime} /> : null}
            </>}
          />

          <GameDetailActionBar ariaLabel="Preview actions">
            {previewActions.map((action) => (
              <GameDetailActionButton key={action.label} action={action} />
            ))}
          </GameDetailActionBar>

          <DetailSection title="About This Game" description="Decide whether this game belongs in your library.">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={i}
                    className="h-4 animate-pulse rounded bg-ink-900"
                    style={{ width: `${[100, 92, 96, 78][i]}%` }}
                  />
                ))}
              </div>
            ) : description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{description}</p>
            ) : (
              <p className="text-sm text-slate-600">No description available for this game.</p>
            )}
          </DetailSection>

          {screenshotsLoading || screenshots.length > 0 ? (
            <DetailSection title="Screenshots">
              <DiscoveryScreenshotStrip rawgId={game.rawgId} title={game.title} />
            </DetailSection>
          ) : null}

          {reason ? (
            <DetailSection title="Why This Recommendation">
              <p className="text-sm leading-relaxed text-slate-300">{reason}</p>
            </DetailSection>
          ) : null}

          <GameInformationSection
            game={previewGame}
            metacriticScore={metacriticScore}
            rawgPlaytime={rawgPlaytime}
            t={t}
          />

          <ContextualRecommendationsSection
            game={previewGame}
            userGames={userGames}
            inboxRawgIds={discoveryInboxRawgIds}
            onSelectGame={(dg) => onOpenLibraryGame?.(dg)}
            onAddToInbox={onAddToInbox}
            onOpenPreview={onOpenPreview}
            title="You Might Also Like"
          />
        </div>
      </div>
    </div>
  );
}
