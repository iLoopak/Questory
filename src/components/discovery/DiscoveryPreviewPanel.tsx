import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types/game';
import type { RawgGameDetails } from '../../types/rawg';
import { discoveryCandidateToGame, discoveryCandidateToPreviewModel, type DiscoveryCandidate, type DiscoveryGame } from '../../lib/discovery';
import { getGameDetails } from '../../services/rawgApi';
import { getArtworkSet, getMetadataSummary } from '../../lib/gameSelectors';
import { useI18n } from '../../i18n';
import { useDiscoveryScreenshots } from '../../hooks/useDiscoveryScreenshots';
import { FullscreenGameShell } from '../game-detail/FullscreenGameShell';
import { GameHero, HeroStat } from '../game-detail/GameHero';
import { DetailSection } from '../game-detail/DetailSection';
import { GameDetailActionBar, GameDetailActionButton, type GameDetailAction } from '../game-detail/GameDetailActions';
import { GameInformationSection, formatMetacriticScore } from '../game-detail/GameInformationSection';
import { RawgRatingBadge, getRawgRatingDisplay } from '../RawgRatingBadge';
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
  const initialCoverUrl = getValidImageUrl(game.coverUrl);
  const [details, setDetails] = useState<RawgGameDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { screenshots, loading: screenshotsLoading } = useDiscoveryScreenshots(game.rawgId);

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

  const enrichedCandidate = useMemo(() => {
    const enrichedBackgroundImage = getValidImageUrl(details?.background_image);
    const bestCoverUrl = initialCoverUrl ?? enrichedBackgroundImage ?? null;

    if (bestCoverUrl === game.coverUrl) return candidate;

    return {
      ...candidate,
      game: {
        ...game,
        coverUrl: bestCoverUrl,
      },
    };
  }, [candidate, details?.background_image, game, initialCoverUrl]);

  const previewModel = useMemo(() => {
    const enrichedBackgroundImage = getValidImageUrl(details?.background_image);
    return discoveryCandidateToPreviewModel(enrichedCandidate, {
      backgroundImage: enrichedBackgroundImage ?? initialCoverUrl ?? null,
      developers: details?.developers?.map((d) => d.name),
      publishers: details?.publishers?.map((p) => p.name),
      source: 'rawg',
    });
  }, [enrichedCandidate, initialCoverUrl, details]);

  const previewArtwork = useMemo(() => getArtworkSet(previewModel), [previewModel]);
  const previewMetadata = useMemo(() => getMetadataSummary(previewModel), [previewModel]);

  // Compatibility Game for shared Game Hub sections that still take Game props.
  // Preview-specific code should prefer previewModel so catalog previews do not
  // conceptually require collectionType/status/notes/playtime.
  const previewGame: Game = useMemo(() => ({
    ...discoveryCandidateToGame(enrichedCandidate, userGames, 'preview'),
    backgroundImage: previewArtwork.background ?? null,
    developers: previewModel.metadata.developers,
    publishers: previewModel.metadata.publishers,
    rawgTags: previewModel.metadata.tags,
    rawgRating: typeof details?.rating === 'number' ? details.rating : previewModel.metadata.rawgRating,
    rawgRatingsCount: typeof details?.ratings_count === 'number' ? details.ratings_count : previewModel.metadata.rawgRatingsCount,
  }), [enrichedCandidate, userGames, previewArtwork, previewModel, details?.rating, details?.ratings_count]);

  const metacriticScore = formatMetacriticScore(previewMetadata.metacritic);
  const rawgRating = getRawgRatingDisplay(previewGame);
  const releaseYear = previewMetadata.releaseYear;
  const description = details?.description_raw?.trim();

  const collectionStatus = isInLibrary
    ? t('discovery.inLibrary')
    : isInWishlist
      ? t('discovery.inWishlist')
      : isInInbox
        ? t('discovery.inDiscoveryInbox')
        : t('discovery.notInLibrary');

  const previewActions: GameDetailAction[] = isInLibrary
    ? [
        {
          icon: 'gamepad-2',
          label: t('preview.openGameHub'),
          onClick: () => onOpenLibraryGame?.(enrichedCandidate.game),
          tone: 'accent',
          disabled: !onOpenLibraryGame,
        },
      ]
    : isInWishlist
      ? [
          {
            icon: 'library',
            label: t('preview.moveToLibrary'),
            onClick: () => onAddToLibrary(enrichedCandidate.game),
            tone: 'accent',
          },
          {
            icon: 'heart',
            label: t('discovery.inYourWishlist'),
            onClick: () => {},
            tone: 'neutral',
            disabled: true,
          },
        ]
      : [
          isInInbox
            ? {
                icon: 'check' as const,
                label: t('discovery.inDiscoveryInbox'),
                onClick: () => {},
                tone: 'neutral' as const,
                disabled: true,
              }
            : {
                icon: 'list-plus' as const,
                label: t('action.reviewLater'),
                onClick: () => onAddToInbox(enrichedCandidate.game, reason ?? ''),
                tone: 'accent' as const,
              },
          {
            icon: 'heart',
            label: t('preview.addToWishlist'),
            onClick: () => onAddToWishlist(enrichedCandidate.game),
            tone: 'neutral',
          },
          {
            icon: 'library',
            label: t('preview.addToLibrary'),
            onClick: () => onAddToLibrary(enrichedCandidate.game),
            tone: 'accent',
          },
        ];

  return (
    <FullscreenGameShell
      ariaLabel={`${t('action.preview')}: ${game.title}`}
      dialogRef={dialogRef}
      onClose={onClose}
      scrollRef={scrollRef}
    >
      <GameHero
        game={previewGame}
        kicker={t('preview.kicker')}
        onBack={onClose}
        stats={<>
          <HeroStat label={t('detail.platformSource')} value={previewGame.platform} />
          <HeroStat label={t('detail.currentStatus')} value={collectionStatus} accent={isInLibrary || isInWishlist} />
          {releaseYear ? <HeroStat label={t('preview.released')} value={releaseYear} /> : null}
          {metacriticScore ? <HeroStat label="Metacritic" value={metacriticScore} /> : null}
          {rawgRating ? <HeroStat label="RAWG" value={`★ ${rawgRating.ratingLabel}`} /> : null}
        </>}
      />

      <GameDetailActionBar ariaLabel={t('preview.actionsA11y')}>
        {previewActions.map((action) => (
          <GameDetailActionButton key={action.label} action={action} />
        ))}
      </GameDetailActionBar>

      <DetailSection title={t('preview.aboutTitle')} description={t('preview.aboutDescription')}>
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
          <p className="text-sm text-slate-600">{t('preview.noDescription')}</p>
        )}
      </DetailSection>

      {screenshotsLoading || screenshots.length > 0 ? (
        <DetailSection title={t('preview.screenshots')}>
          <DiscoveryScreenshotStrip rawgId={game.rawgId} title={game.title} />
        </DetailSection>
      ) : null}

      {reason ? (
        <DetailSection title={t('preview.whyTitle')}>
          <p className="text-sm leading-relaxed text-slate-300">{reason}</p>
        </DetailSection>
      ) : null}

      <GameInformationSection
        game={previewGame}
        metacriticScore={metacriticScore}
        rawgRatingBadge={<RawgRatingBadge game={previewGame} variant="detail" />}
        t={t}
      />

      <ContextualRecommendationsSection
        game={previewGame}
        userGames={userGames}
        inboxRawgIds={discoveryInboxRawgIds}
        onSelectGame={(dg) => onOpenLibraryGame?.(dg)}
        onAddToInbox={onAddToInbox}
        onOpenPreview={onOpenPreview}
        title={t('preview.youMightAlsoLike')}
      />
    </FullscreenGameShell>
  );
}

function getValidImageUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
