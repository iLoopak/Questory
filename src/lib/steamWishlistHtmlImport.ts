import type { SteamWishlistItem } from '../types/steam';

export type ParsedSteamWishlistImportItem = Pick<SteamWishlistItem, 'appid' | 'name' | 'storeUrl'>;

export type SteamWishlistHtmlParseResult = {
  items: ParsedSteamWishlistImportItem[];
  skippedCount: number;
};

const steamAppUrlPattern = /https?:\/\/store\.steampowered\.com\/app\/(\d+)(?:\/([^\s"'<>?#]*))?/gi;

export function parseSteamWishlistHtmlText(input: string): ParsedSteamWishlistImportItem[] {
  return parseSteamWishlistHtmlTextWithSummary(input).items;
}

export function parseSteamWishlistHtmlTextWithSummary(input: string): SteamWishlistHtmlParseResult {
  const parsedItems: ParsedSteamWishlistImportItem[] = [];
  const seenAppIds = new Set<number>();
  let skippedCount = 0;

  for (const match of input.matchAll(steamAppUrlPattern)) {
    const appid = Number(match[1]);

    if (!Number.isSafeInteger(appid) || appid <= 0 || seenAppIds.has(appid)) {
      skippedCount += 1;
      continue;
    }

    seenAppIds.add(appid);
    parsedItems.push({
      appid,
      name: getTitleFromSteamSlug(match[2]) ?? `Steam App ${appid}`,
      storeUrl: `https://store.steampowered.com/app/${appid}`,
    });
  }

  return { items: parsedItems, skippedCount };
}

function getTitleFromSteamSlug(slug: string | undefined) {
  if (!slug) {
    return null;
  }

  const decodedSlug = safeDecodeURIComponent(slug);
  const title = decodedSlug
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return title || null;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
