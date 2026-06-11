import type { SteamWishlistItem } from '../types/steam';

export type ParsedSteamWishlistImportItem = Pick<SteamWishlistItem, 'appid' | 'name' | 'storeUrl'>;

export type SteamWishlistHtmlParseResult = {
  items: ParsedSteamWishlistImportItem[];
  duplicateCount: number;
  skippedCount: number;
};

const steamAppUrlPattern = /https?:\/\/(?:store\.)?steampowered\.com\/app\/(\d+)(?:\/([^\s"'<>?#]*))?/gi;
const steamAppPathPattern = /\/app\/(\d+)(?:\/([^\s"'<>?#]*))?/gi;
const steamAppAnchorPattern = /<a\b[^>]*href=["'][^"']*\/app\/(\d+)(?:\/([^"'<>?#]*))?[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
const plainAppIdLinePattern = /^\s*([1-9]\d{1,9})\s*$/gm;

export const steamWishlistBookmarklet = String.raw`javascript:(async()=>{const sleep=t=>new Promise(r=>setTimeout(r,t));const seen=new Map();const clean=t=>(t||'').replace(/\s+/g,' ').trim();const getTitle=a=>{const row=a.closest('[id^="game_"],.wishlistRow,.wishlist_row,[data-app-id]');return clean(row?.querySelector('.title,.gameListRowItemName,.ellipsis')?.textContent)||clean(a.textContent);};const collect=()=>{document.querySelectorAll('a[href*="store.steampowered.com/app/"]').forEach(a=>{const m=a.href.match(/\/app\/(\d+)/);if(!m)return;const current=seen.get(m[1]);const title=getTitle(a);if(!current||(!current.title&&title))seen.set(m[1],{url:a.href,title});});};const getScroller=()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+300);return els.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight))[0]||document.scrollingElement||document.documentElement;};let scroller=getScroller();let stable=0,last=0;for(let i=0;i<250;i++){collect();scroller=getScroller();const step=Math.max(500,Math.floor(scroller.clientHeight*0.65));scroller.scrollTop=Math.min(scroller.scrollTop+step,scroller.scrollHeight);window.scrollBy(0,step);await sleep(1200);collect();if(seen.size===last)stable++;else stable=0;last=seen.size;if(stable>=12)break;}const out=[...seen.entries()].sort((a,b)=>Number(a[0])-Number(b[0])).map(([,item])=>item.title?\`\${item.title}\t\${item.url}\`:item.url).join('\n');try{await navigator.clipboard.writeText(out);alert(\`QuestShelf: copied \${seen.size} Steam wishlist games to clipboard.\`);}catch(e){const ta=document.createElement('textarea');ta.value=out;ta.style='position:fixed;z-index:999999;top:20px;left:20px;width:80vw;height:70vh;background:#111;color:#fff;padding:16px;font:14px monospace;';document.body.appendChild(ta);ta.focus();ta.select();alert(\`QuestShelf: found \${seen.size} games. Copy them from the textarea.\`);}})()`;

export function parseSteamWishlistHtmlText(input: string): ParsedSteamWishlistImportItem[] {
  return parseSteamWishlistHtmlTextWithSummary(input).items;
}

export function parseSteamWishlistHtmlTextWithSummary(input: string): SteamWishlistHtmlParseResult {
  const parsedItems: ParsedSteamWishlistImportItem[] = [];
  const itemIndexByAppId = new Map<number, number>();
  let duplicateCount = 0;
  let skippedCount = 0;

  const addItem = (appidText: string | undefined, extractedTitle?: string | null, slug?: string, source = 'unknown') => {
    const appid = Number(appidText);

    if (!Number.isSafeInteger(appid) || appid <= 0) {
      skippedCount += 1;
      console.warn('[Steam Wishlist HTML Import] Skipped wishlist entry with invalid app id.', { appidText, source });
      return;
    }

    const normalizedExtractedTitle = normalizeExtractedTitle(extractedTitle);
    const titleFromSlug = getTitleFromSteamSlug(slug);
    const title = normalizedExtractedTitle ?? titleFromSlug ?? `Steam App ${appid}`;
    const titleSource = normalizedExtractedTitle ? source : titleFromSlug ? 'store-url-slug' : 'placeholder';
    const existingIndex = itemIndexByAppId.get(appid);

    if (typeof existingIndex === 'number') {
      duplicateCount += 1;
      const existingItem = parsedItems[existingIndex];

      if (isPlaceholderSteamAppTitle(existingItem.name, appid) && !isPlaceholderSteamAppTitle(title, appid)) {
        parsedItems[existingIndex] = { ...existingItem, name: title };
        console.info('[Steam Wishlist HTML Import] Repaired duplicate wishlist title from later HTML match.', {
          appid,
          previousTitle: existingItem.name,
          title,
          titleSource,
        });
      } else {
        console.debug('[Steam Wishlist HTML Import] Ignored duplicate wishlist entry.', {
          appid,
          existingTitle: existingItem.name,
          duplicateTitle: title,
          titleSource,
        });
      }

      return;
    }

    itemIndexByAppId.set(appid, parsedItems.length);
    parsedItems.push({
      appid,
      name: title,
      storeUrl: `https://store.steampowered.com/app/${appid}`,
    });

    const logPayload = { appid, title, titleSource, slug };
    if (titleSource === 'placeholder') {
      console.warn('[Steam Wishlist HTML Import] Falling back to placeholder title; no wishlist HTML title was found.', logPayload);
    } else {
      console.debug('[Steam Wishlist HTML Import] Extracted wishlist title.', logPayload);
    }
  };

  for (const item of parseSteamWishlistDataScriptItems(input)) {
    addItem(item.appid.toString(), item.name, undefined, 'g_rgWishlistData');
  }

  const consumedRanges: Array<[number, number]> = [];

  for (const item of parseSteamWishlistTextLineItems(input)) {
    addItem(item.appid.toString(), item.name, item.slug, 'text-line');
    consumedRanges.push(item.consumedRange);
  }

  for (const match of input.matchAll(steamAppAnchorPattern)) {
    addItem(match[1], getTitleFromHtmlFragment(match[3]), match[2], 'anchor-text');
    if (typeof match.index === 'number') {
      consumedRanges.push([match.index, match.index + match[0].length]);
    }
  }

  const inputWithoutAnchors = maskConsumedRanges(input, consumedRanges);

  for (const match of inputWithoutAnchors.matchAll(steamAppUrlPattern)) {
    addItem(match[1], null, match[2], 'store-url');
    if (typeof match.index === 'number') {
      consumedRanges.push([match.index, match.index + match[0].length]);
    }
  }

  const inputWithoutFullUrls = maskConsumedRanges(input, consumedRanges);

  for (const match of inputWithoutFullUrls.matchAll(steamAppPathPattern)) {
    addItem(match[1], null, match[2], 'store-path');
    if (typeof match.index === 'number') {
      consumedRanges.push([match.index, match.index + match[0].length]);
    }
  }

  const remainingInput = maskConsumedRanges(input, consumedRanges);

  for (const match of remainingInput.matchAll(plainAppIdLinePattern)) {
    addItem(match[1], null, undefined, 'plain-app-id');
  }

  console.info('[Steam Wishlist HTML Import] Parsed wishlist HTML text.', {
    itemCount: parsedItems.length,
    duplicateCount,
    skippedCount,
    placeholderCount: parsedItems.filter((item) => isPlaceholderSteamAppTitle(item.name, item.appid)).length,
  });

  return { items: parsedItems, duplicateCount, skippedCount };
}

function maskConsumedRanges(input: string, ranges: Array<[number, number]>) {
  if (ranges.length === 0) {
    return input;
  }

  const characters = input.split('');
  ranges.forEach(([start, end]) => {
    for (let index = start; index < end; index += 1) {
      characters[index] = ' ';
    }
  });

  return characters.join('');
}

function getTitleFromSteamSlug(slug: string | undefined) {
  if (!slug) {
    return null;
  }

  const firstSlugSegment = slug.split('/').find(Boolean);

  if (!firstSlugSegment) {
    return null;
  }

  const decodedSlug = safeDecodeURIComponent(firstSlugSegment);
  const title = decodedSlug
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return title || null;
}


function parseSteamWishlistDataScriptItems(input: string): ParsedSteamWishlistImportItem[] {
  const wishlistDataMatch = input.match(/var\s+g_rgWishlistData\s*=\s*(\[.*?\]|\{.*?\});/s);

  if (!wishlistDataMatch) {
    return [];
  }

  try {
    const payload = JSON.parse(wishlistDataMatch[1]) as unknown;
    const entries = Array.isArray(payload) ? payload.map((value) => [undefined, value] as const) : Object.entries(payload as Record<string, unknown>);

    return entries.flatMap(([fallbackAppId, value]) => {
      if (!value || typeof value !== 'object') {
        return [];
      }

      const entry = value as Record<string, unknown>;
      const appid = getNumber(entry.appid) ?? getNumber(fallbackAppId);
      const name = getString(entry.name);

      if (!appid || !name) {
        return [];
      }

      return [{ appid, name, storeUrl: `https://store.steampowered.com/app/${appid}` }];
    });
  } catch (error) {
    console.warn('[Steam Wishlist HTML Import] Failed to parse Steam wishlist data script.', { error });
    return [];
  }
}

function parseSteamWishlistTextLineItems(input: string): Array<ParsedSteamWishlistImportItem & { consumedRange: [number, number]; slug?: string }> {
  const items: Array<ParsedSteamWishlistImportItem & { consumedRange: [number, number]; slug?: string }> = [];
  const titledSteamAppUrlLinePattern = /^.*https?:\/\/(?:store\.)?steampowered\.com\/app\/\d+.*$/gmi;

  for (const lineMatch of input.matchAll(titledSteamAppUrlLinePattern)) {
    const line = lineMatch[0];

    if (line.includes('<') || typeof lineMatch.index !== 'number') {
      continue;
    }

    const urlMatch = line.match(/https?:\/\/(?:store\.)?steampowered\.com\/app\/(\d+)(?:\/([^\s"'<>?#]*))?/i);

    if (!urlMatch || typeof urlMatch.index !== 'number') {
      continue;
    }

    const appid = Number(urlMatch[1]);
    const titleBeforeUrl = line.slice(0, urlMatch.index);
    const titleAfterUrl = line.slice(urlMatch.index + urlMatch[0].length);
    const name = normalizeExtractedTitle(titleBeforeUrl) ?? normalizeExtractedTitle(titleAfterUrl);

    if (!Number.isSafeInteger(appid) || appid <= 0 || !name) {
      continue;
    }

    items.push({
      appid,
      consumedRange: [lineMatch.index, lineMatch.index + line.length],
      name,
      slug: urlMatch[2],
      storeUrl: `https://store.steampowered.com/app/${appid}`,
    });
  }

  return items;
}

function getTitleFromHtmlFragment(fragment: string | undefined) {
  if (!fragment) {
    return null;
  }

  const withoutTags = fragment
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  return normalizeExtractedTitle(decodeHtmlEntities(withoutTags));
}

function normalizeExtractedTitle(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const title = decodeHtmlEntities(value)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(?:store\.)?steampowered\.com\/app\/\d+\S*/gi, ' ')
    .replace(/[|•·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title || /^[-–—:]+$/.test(title)) {
    return null;
  }

  return title;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([\da-f]+);/gi, (_match, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)));
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsedValue = Number(value);
    return Number.isSafeInteger(parsedValue) ? parsedValue : null;
  }

  return null;
}

function isPlaceholderSteamAppTitle(title: string, appid: number) {
  return title.trim().toLowerCase() === `steam app ${appid}`.toLowerCase();
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
