// AS-14: the artwork application, as a pure transition.
//
// `refreshGameMetadataFromActions` used to declare `let appliedArtwork = false`, flip it inside a
// `setGames` updater, and then choose between the "Artwork updated" and "No artwork found" toast by
// reading it on the next line — a value React had not promised to have produced yet, and one that a
// Strict-mode double invocation would compute twice. The decision is made here now, once, from the
// games the command actually applied.
//
// Custom/protected artwork is preserved exactly as before: `mergeSteamGridDbArtworkIntoGame` and
// `applyRawgArtworkOnly` are the same guards, in the same order (SteamGridDB first, RAWG only as the
// fallback for a game that still has no real cover).

import { hasProtectedArtwork, isMissingOrGeneratedCover } from './gameCoverImages';
import { mergeSteamGridDbArtworkIntoGame, type SteamGridDbArtwork } from './steamGridDbArtwork';
import { touchGameRecord } from './importTransitions';
import type { TransitionResult } from './stateTransition';
import type { Game } from '../types/game';
import type { RawgMetadata } from '../types/rawg';

export type ArtworkTransitionResult = {
  /** True when the game's artwork actually changed — the only thing the toast may claim. */
  appliedArtwork: boolean;
};

/**
 * Apply the artwork found for one game. `metadata` is null when RAWG had no match and only the
 * SteamGridDB artwork is available.
 */
export function applyArtworkTransition(
  currentGames: Game[],
  targetGameId: string,
  sgdbArtwork: SteamGridDbArtwork | null,
  metadata: RawgMetadata | null,
  now: Date = new Date(),
): TransitionResult<Game[], ArtworkTransitionResult> {
  let appliedArtwork = false;

  const nextGames = currentGames.map((game) => {
    if (game.id !== targetGameId) {
      return game;
    }

    let nextGame = mergeSteamGridDbArtworkIntoGame(game, sgdbArtwork);
    if (metadata) {
      nextGame = applyRawgArtworkOnly(nextGame, metadata, now);
    }

    if (nextGame === game) {
      return game;
    }

    appliedArtwork = true;
    return touchGameRecord(nextGame);
  });

  return { nextState: appliedArtwork ? nextGames : currentGames, result: { appliedArtwork } };
}

export function applyRawgArtworkOnly(game: Game, metadata: RawgMetadata, now: Date = new Date()): Game {
  const coverImage = metadata.coverImage?.trim() || metadata.backgroundImage?.trim();
  if (!coverImage || hasProtectedArtwork(game) || !isMissingOrGeneratedCover(game.coverImage)) {
    return game;
  }

  return {
    ...game,
    artworkSource: 'rawg',
    artworkUpdatedAt: metadata.artworkUpdatedAt ?? now.toISOString(),
    coverImage,
  };
}
