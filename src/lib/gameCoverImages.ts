import type { Game } from '../types/game';
import type { RawgMetadata } from '../types/rawg';
import { getSteamArtworkUrls } from './steamArtwork';

export const artworkSourcePriority = [
  'user',
  'steam',
  'rawg',
  'imported',
  'generated-fallback',
] as const;

export type ArtworkSource = (typeof artworkSourcePriority)[number];

const generatedPlaceholderMarkers = ['placeholder', 'placehold.co', 'data:image/svg+xml'];
const generatedFallbackMarker = 'data:image/svg+xml';

export function getGameCoverSources(game: Game) {
  return getArtworkCandidates(game).map((candidate) => candidate.url);
}

export function getArtworkCandidates(game: Game): Array<{ source: ArtworkSource; url: string }> {
  const candidates: Array<{ source: ArtworkSource; url: string }> = [];
  const currentSource = getStoredArtworkSource(game);
  const currentCover = game.coverImage?.trim();

  if (currentCover && currentSource === 'user') {
    candidates.push({ source: 'user', url: currentCover });
  }

  if (typeof game.steamAppId === 'number') {
    const artworkUrls = getSteamArtworkUrls(game.steamAppId);
    candidates.push({ source: 'steam', url: artworkUrls.library });
    candidates.push({ source: 'steam', url: artworkUrls.header });
    candidates.push({ source: 'steam', url: artworkUrls.capsule });
  } else if (currentCover && currentSource === 'steam') {
    candidates.push({ source: 'steam', url: currentCover });
  }

  if (game.backgroundImage) {
    candidates.push({ source: 'rawg', url: game.backgroundImage });
  }

  if (currentCover && currentSource === 'rawg' && currentCover !== game.backgroundImage) {
    candidates.push({ source: 'rawg', url: currentCover });
  }

  if (currentCover && currentSource === 'imported') {
    candidates.push({ source: 'imported', url: currentCover });
  }

  candidates.push({ source: 'generated-fallback', url: getGeneratedFallbackCover(game) });

  return dedupeCandidates(candidates);
}

export function canUseRawgImageAsCover(game: Game) {
  return Boolean(game.backgroundImage && !hasProtectedArtwork(game) && isMissingOrGeneratedCover(game.coverImage));
}

export function getRawgMetadataWithCoverFallback(game: Game, metadata: RawgMetadata): RawgMetadata {
  if (!metadata.backgroundImage || hasProtectedArtwork(game) || !isMissingOrGeneratedCover(game.coverImage)) {
    return metadata;
  }

  return {
    ...metadata,
    artworkSource: 'rawg',
    artworkUpdatedAt: new Date().toISOString(),
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

export function hasRealArtwork(game: Game) {
  return Boolean(game.coverImage?.trim() && !isMissingOrGeneratedCover(game.coverImage));
}

export function hasProtectedArtwork(game: Game) {
  const source = getStoredArtworkSource(game);

  return source === 'user' || source === 'steam' || (typeof game.steamAppId === 'number' && hasRealArtwork(game));
}

export function isSteamImportedGame(game: Game) {
  return game.externalSource === 'steam' || typeof game.steamAppId === 'number';
}

export function getStoredArtworkSource(game: Game): ArtworkSource | undefined {
  if (game.artworkSource && artworkSourcePriority.includes(game.artworkSource)) {
    return game.artworkSource;
  }

  const coverImage = game.coverImage?.trim();

  if (!coverImage || isMissingOrGeneratedCover(coverImage)) {
    return undefined;
  }

  if (coverImage.includes('steamstatic.com') || coverImage.includes('/steam/apps/')) {
    return 'steam';
  }

  if (game.backgroundImage && coverImage === game.backgroundImage) {
    return 'rawg';
  }

  if (game.externalSource && game.externalSource !== 'manual') {
    return 'imported';
  }

  return 'user';
}

export function getGeneratedFallbackCover(game: Game) {
  const seed = hashString(`${game.id}:${game.title}:${game.platform}`);
  const palette = fallbackPalettes[seed % fallbackPalettes.length];
  const accentAngle = 18 + (seed % 42);
  const initials = getInitials(game.title);
  const title = escapeSvgText(game.title);
  const platform = escapeSvgText(game.platform);
  const subtitle = game.collectionType === 'wishlist' ? 'WISHLIST' : 'LOCAL LIBRARY';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900" role="img" aria-label="${title} generated cover">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette[0]}"/>
      <stop offset="0.58" stop-color="${palette[1]}"/>
      <stop offset="1" stop-color="#071018"/>
    </linearGradient>
    <radialGradient id="glow" cx="72%" cy="22%" r="62%">
      <stop offset="0" stop-color="#39f7e2" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#39f7e2" stop-opacity="0"/>
    </radialGradient>
    <filter id="softGlow"><feGaussianBlur stdDeviation="6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="600" height="900" fill="url(#bg)"/>
  <rect width="600" height="900" fill="url(#glow)"/>
  <g opacity="0.16" stroke="#ffffff" stroke-width="1">
    <path d="M-80 160 C 80 40, 250 210, 680 70" fill="none"/>
    <path d="M-120 740 C 90 570, 280 830, 720 610" fill="none"/>
    <path d="M72 0 L540 900"/>
    <path d="M${accentAngle} 0 L600 760"/>
  </g>
  <rect x="38" y="38" width="524" height="824" rx="34" fill="none" stroke="#39f7e2" stroke-opacity="0.58" stroke-width="3"/>
  <rect x="58" y="58" width="484" height="784" rx="24" fill="#020617" fill-opacity="0.22" stroke="#ffffff" stroke-opacity="0.10"/>
  <g filter="url(#softGlow)">
    <circle cx="300" cy="282" r="96" fill="#39f7e2" fill-opacity="0.11" stroke="#39f7e2" stroke-opacity="0.72" stroke-width="3"/>
    <text x="300" y="310" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="70" font-weight="800" fill="#39f7e2" letter-spacing="4">${initials}</text>
  </g>
  <rect x="82" y="470" width="436" height="2" fill="#39f7e2" opacity="0.72"/>
  <text x="82" y="532" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="48" font-weight="800" fill="#ffffff">${wrapSvgTitle(title, 14).join('</text><text x="82" dy="58" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="48" font-weight="800" fill="#ffffff">')}</text>
  <rect x="82" y="742" width="${Math.min(390, 96 + platform.length * 11)}" height="50" rx="25" fill="#39f7e2" fill-opacity="0.14" stroke="#39f7e2" stroke-opacity="0.64"/>
  <text x="110" y="774" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="22" font-weight="800" fill="#9ffcf2" letter-spacing="2">${platform.toUpperCase()}</text>
  <text x="82" y="824" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="16" font-weight="800" fill="#94a3b8" letter-spacing="4">${subtitle}</text>
</svg>`;

  return `${generatedFallbackMarker};utf8,${encodeURIComponent(svg)}`;
}

function dedupeCandidates(candidates: Array<{ source: ArtworkSource; url: string }>) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    if (!candidate.url.trim() || seen.has(candidate.url)) {
      return false;
    }

    seen.add(candidate.url);
    return true;
  });
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
}

function getInitials(title: string) {
  const words = title
    .replace(/[^a-z0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return 'QS';
  }

  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
}

function escapeSvgText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapSvgTitle(title: string, maxLineLength: number) {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxLineLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    currentLine = nextLine;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3).map((line, index, slicedLines) => {
    if (index === slicedLines.length - 1 && lines.length > slicedLines.length) {
      return `${line.replace(/\s+\S*$/, '')}…`;
    }

    return line;
  });
}

const fallbackPalettes = [
  ['#101827', '#0f766e'],
  ['#111827', '#1d4ed8'],
  ['#172033', '#7c3aed'],
  ['#0b1120', '#be123c'],
  ['#111827', '#15803d'],
  ['#1f172a', '#c2410c'],
];
