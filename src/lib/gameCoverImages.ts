import type { Game } from '../types/game';
import type { RawgMetadata } from '../types/rawg';
import { getSteamArtworkUrls } from './steamArtwork';

const generatedPlaceholderMarkers = ['placeholder', 'placehold.co', 'data:image/svg+xml', '/covers/'];

export function getGameCoverSources(game: Game) {
  if (typeof game.steamAppId === 'number') {
    const artworkUrls = getSteamArtworkUrls(game.steamAppId);
    return [artworkUrls.library, artworkUrls.header, artworkUrls.capsule];
  }

  if (game.backgroundImage && isMissingOrGeneratedCover(game.coverImage)) {
    return [game.backgroundImage];
  }

  return game.coverImage ? [game.coverImage] : [];
}

export function canUseRawgImageAsCover(game: Game) {
  return Boolean(game.backgroundImage && !isSteamImportedGame(game) && isMissingOrGeneratedCover(game.coverImage));
}

export function getRawgMetadataWithCoverFallback(game: Game, metadata: RawgMetadata): RawgMetadata {
  if (!metadata.backgroundImage || isSteamImportedGame(game) || !isMissingOrGeneratedCover(game.coverImage)) {
    return metadata;
  }

  return {
    ...metadata,
    coverImage: metadata.backgroundImage,
  };
}

export function isMissingOrGeneratedCover(coverImage?: string | null) {
  const normalizedCoverImage = coverImage?.trim().toLowerCase();

  if (!normalizedCoverImage) {
    return true;
  }

  return generatedPlaceholderMarkers.some((marker) => normalizedCoverImage.includes(marker));
}

export function isSteamImportedGame(game: Game) {
  return game.externalSource === 'steam' || typeof game.steamAppId === 'number';
}
