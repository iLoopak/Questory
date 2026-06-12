import type { Game } from '../types/game';
import type { RawgMetadata } from '../types/rawg';
import { hasProtectedArtwork, isMissingOrGeneratedCover } from './gameCoverImages';

const artworkUrlFields = [
  'coverImage',
  'coverUrl',
  'imageUrl',
  'artworkUrl',
  'backgroundUrl',
  'backgroundImage',
  'headerImage',
  'capsuleImage',
  'customArtwork',
] as const;

const artworkMetadataFields = [
  'artworkSource',
  'artworkUpdatedAt',
] as const;

function hasOwnValue(object: object, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isValidArtworkUrl(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !isMissingOrGeneratedCover(value);
}

function hasExistingArtworkValue(game: Game, key: string) {
  const value = (game as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0;
}

function hasAcceptedArtworkUrl(metadata: RawgMetadata, mergedGame: Game) {
  const metadataRecord = metadata as Record<string, unknown>;

  return artworkUrlFields.some((field) => {
    if (!hasOwnValue(metadata, field)) {
      return false;
    }

    return isValidArtworkUrl(metadataRecord[field]) && (mergedGame as Record<string, unknown>)[field] === metadataRecord[field];
  });
}

export function mergeRawgMetadataIntoGame(game: Game, metadata: RawgMetadata): Game {
  const metadataRecord = metadata as Record<string, unknown>;
  const mergedGame = {
    ...game,
    ...metadata,
  };
  const mergedRecord = mergedGame as Record<string, unknown>;
  const existingRecord = game as Record<string, unknown>;
  const protectsCoverImage = hasProtectedArtwork(game);

  artworkUrlFields.forEach((field) => {
    if (!hasOwnValue(metadata, field)) {
      return;
    }

    const nextValue = metadataRecord[field];
    const existingValue = existingRecord[field];

    if (field === 'customArtwork' && hasExistingArtworkValue(game, field) && !isValidArtworkUrl(nextValue)) {
      mergedRecord[field] = existingValue;
      return;
    }

    if (field === 'coverImage' && protectsCoverImage) {
      mergedRecord.coverImage = game.coverImage;
      return;
    }

    if (!isValidArtworkUrl(nextValue) && hasExistingArtworkValue(game, field)) {
      mergedRecord[field] = existingValue;
    }
  });

  if (protectsCoverImage) {
    mergedGame.artworkSource = game.artworkSource;
    mergedGame.artworkUpdatedAt = game.artworkUpdatedAt;
  } else if (!hasAcceptedArtworkUrl(metadata, mergedGame)) {
    artworkMetadataFields.forEach((field) => {
      if (hasOwnValue(metadata, field) && hasExistingArtworkValue(game, field)) {
        mergedRecord[field] = existingRecord[field];
      }
    });
  }

  return mergedGame;
}
