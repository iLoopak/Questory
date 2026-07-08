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

function getPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function preservePositiveExternalNumber(
  metadataRecord: Record<string, unknown>,
  existingRecord: Record<string, unknown>,
  mergedRecord: Record<string, unknown>,
  targetField: 'metacriticScore',
  legacyField: 'metacritic',
) {
  const nextValue = getPositiveNumber(metadataRecord[targetField] ?? metadataRecord[legacyField]);

  if (nextValue) {
    mergedRecord[targetField] = nextValue;
    return;
  }

  const existingValue = getPositiveNumber(existingRecord[targetField]);
  if (existingValue) {
    mergedRecord[targetField] = existingValue;
  } else {
    delete mergedRecord[targetField];
  }
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

type MergeRawgMetadataOptions = {
  /**
   * Metadata-only refreshes must not change artwork state. RAWG may return
   * background images that are useful artwork candidates, but Quest Queue's
   * Refresh Metadata action should only update descriptive metadata.
   */
  preserveArtwork?: boolean;
};

const preservedArtworkFields = [
  ...artworkUrlFields,
  'wideCoverImage',
  'heroImage',
  'logoImage',
  'iconImage',
  'artworkSourceMetadata',
] as const;

export function mergeRawgMetadataIntoGame(game: Game, metadata: RawgMetadata, options: MergeRawgMetadataOptions = {}): Game {
  const metadataRecord = metadata as Record<string, unknown>;
  const mergedGame = {
    ...game,
    ...metadata,
  };
  const mergedRecord = mergedGame as Record<string, unknown>;
  const existingRecord = game as Record<string, unknown>;
  preservePositiveExternalNumber(metadataRecord, existingRecord, mergedRecord, 'metacriticScore', 'metacritic');
  const protectsCoverImage = hasProtectedArtwork(game);

  if (options.preserveArtwork) {
    preservedArtworkFields.forEach((field) => {
      if (hasOwnValue(game, field)) {
        mergedRecord[field] = existingRecord[field];
      } else {
        delete mergedRecord[field];
      }
    });
    artworkMetadataFields.forEach((field) => {
      if (hasOwnValue(game, field)) {
        mergedRecord[field] = existingRecord[field];
      } else {
        delete mergedRecord[field];
      }
    });
    return mergedGame;
  }

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
