import type { SteamWishlistItem } from '../types/steam';

export type ParsedSteamWishlistImportItem = Pick<SteamWishlistItem, 'appid' | 'name' | 'storeUrl'> & {
  titleSource?: SteamWishlistImportTitleSource;
};

export type SteamWishlistImportTitleSource = 'DOM' | 'HTML' | 'JSON' | 'slug' | 'appdetails' | 'placeholder';

export type SteamWishlistHtmlParseResult = {
  items: ParsedSteamWishlistImportItem[];
  duplicateCount: number;
  skippedCount: number;
};

type ParsedSteamWishlistTextLineItem = ParsedSteamWishlistImportItem & { consumedRange: [number, number]; slug?: string };

const steamAppUrlPattern = /https?:\/\/(?:store\.)?steampowered\.com\/app\/(\d+)(?:\/([^\s"'<>?#]*))?/gi;
const steamAppPathPattern = /\/app\/(\d+)(?:\/([^\s"'<>?#]*))?/gi;
const steamAppAnchorPattern = /<a\b[^>]*href=["'][^"']*\/app\/(\d+)(?:\/([^"'<>?#]*))?[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
const plainAppIdLinePattern = /^\s*([1-9]\d{1,9})\s*$/gm;
const steamStoreAppDetailsFilters = 'basic';

export const steamWishlistBookmarklet = String.raw`javascript:(async()=>{const sleep=t=>new Promise(r=>setTimeout(r,t));const seen=new Map();const clean=t=>(t||'').replace(/https?:\/\/\S+/gi,' ').replace(/\s+/g,' ').trim();const good=t=>{t=clean(t);return t&&!/^Steam App \d+$/i.test(t)&&!/^\d+$/.test(t)?t:''};const jsonTitles=new Map();document.querySelectorAll('script').forEach(s=>{const text=s.textContent||'';const m=text.match(/var\s+g_rgWishlistData\s*=\s*(\[.*?\]|\{.*?\});/s);if(!m)return;try{const data=JSON.parse(m[1]);const entries=Array.isArray(data)?data.map(v=>[v&&v.appid,v]):Object.entries(data);entries.forEach(([id,v])=>{const appid=String((v&&v.appid)||id||'').match(/\d+/)?.[0];const title=good(v&&v.name);if(appid&&title)jsonTitles.set(appid,title);});}catch(e){console.warn('[Questory Steam Wishlist Bookmarklet] Failed to parse wishlist JSON.',e);}});const attrTitle=e=>good(e?.getAttribute?.('aria-label'))||good(e?.getAttribute?.('title'))||good(e?.getAttribute?.('alt'));const textFrom=e=>good(e?.textContent);const sourceTitle=(a,appid)=>{const row=a.closest('[id^="game_"],.wishlistRow,.wishlist_row,[data-app-id],[data-appid],[data-ds-appid],[class*="wishlist" i],[class*="game" i]');const scopes=[row,a].filter(Boolean);for(const scope of scopes){for(const sel of ['.title','[class*="title" i]','[class*="name" i]']){const title=good(scope.querySelector?.(sel)?.textContent);if(title)return{title,source:'DOM'};}}for(const scope of scopes){const imgTitle=good(scope.querySelector?.('img')?.getAttribute('alt'))||good(scope.querySelector?.('img')?.getAttribute('title'));if(imgTitle)return{title:imgTitle,source:'DOM'};}for(const scope of scopes){const title=attrTitle(scope);if(title)return{title,source:'DOM'};}const anchorTitle=attrTitle(a)||textFrom(a);if(anchorTitle)return{title:anchorTitle,source:'DOM'};const near=textFrom(row);if(near)return{title:near,source:'DOM'};const jsonTitle=jsonTitles.get(appid);if(jsonTitle)return{title:jsonTitle,source:'JSON'};return{title:'',source:'placeholder'};};const better=(next,current)=>next.title&&(!current?.title||current.source==='placeholder'||(current.source==='JSON'&&next.source==='DOM'));const remember=(appid,url,next)=>{const current=seen.get(appid);if(!current||better(next,current)){seen.set(appid,{url,title:next.title,source:next.source});console.info('[Questory Steam Wishlist Bookmarklet] title source per item',{appid,title:next.title||'Steam App '+appid,titleSource:next.source});}};const collect=()=>{document.querySelectorAll('a[href*="store.steampowered.com/app/"],a[href^="/app/"]').forEach(a=>{const href=a.href||a.getAttribute('href')||'';const m=href.match(/\/app\/(\d+)/);if(!m)return;remember(m[1],a.href||'https://store.steampowered.com/app/'+m[1],sourceTitle(a,m[1]));});jsonTitles.forEach((title,appid)=>remember(appid,'https://store.steampowered.com/app/'+appid,{title,source:'JSON'}));};const getScroller=()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+300);return els.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight))[0]||document.scrollingElement||document.documentElement;};let scroller=getScroller();let stable=0,last=0;for(let i=0;i<250;i++){collect();scroller=getScroller();const step=Math.max(500,Math.floor(scroller.clientHeight*0.65));scroller.scrollTop=Math.min(scroller.scrollTop+step,scroller.scrollHeight);window.scrollBy(0,step);await sleep(1200);collect();if(seen.size===last)stable++;else stable=0;last=seen.size;if(stable>=12)break;}const sorted=[...seen.entries()].sort((a,b)=>Number(a[0])-Number(b[0]));const out=sorted.map(([appid,item])=>item.title?item.title+'\t'+item.url:item.url).join('\n');const placeholders=sorted.filter(([appid,item])=>!item.title||/^Steam App \d+$/i.test(item.title)).length;console.info('[Questory Steam Wishlist Bookmarklet] copied bookmarklet item count',{itemCount:seen.size,placeholderCount:placeholders});try{await navigator.clipboard.writeText(out);alert('Questory: copied '+seen.size+' Steam wishlist games to clipboard.');}catch(e){const ta=document.createElement('textarea');ta.value=out;ta.style='position:fixed;z-index:999999;top:20px;left:20px;width:80vw;height:70vh;background:#111;color:#fff;padding:16px;font:14px monospace;';document.body.appendChild(ta);ta.focus();ta.select();alert('Questory: found '+seen.size+' games. Copy them from the textarea.');}})()`;

export function parseSteamWishlistHtmlText(input: string): ParsedSteamWishlistImportItem[] {
  return parseSteamWishlistHtmlTextWithSummary(input).items;
}

export function parseSteamWishlistHtmlTextWithSummary(input: string): SteamWishlistHtmlParseResult {
  const parsedItems: ParsedSteamWishlistImportItem[] = [];
  const itemIndexByAppId = new Map<number, number>();
  let duplicateCount = 0;
  let skippedCount = 0;

  const addItem = (appidText: string | undefined, extractedTitle?: string | null, slug?: string, source: SteamWishlistImportTitleSource | 'text-line' | 'anchor-text' | 'store-url' | 'store-path' | 'plain-app-id' = 'placeholder') => {
    const appid = Number(appidText);

    if (!Number.isSafeInteger(appid) || appid <= 0) {
      skippedCount += 1;
      console.warn('[Steam Wishlist HTML Import] Skipped wishlist entry with invalid app id.', { appidText, source });
      return;
    }

    const normalizedExtractedTitle = normalizeExtractedTitle(extractedTitle);
    const titleFromSlug = getTitleFromSteamSlug(slug);
    const title = normalizedExtractedTitle ?? titleFromSlug ?? `Steam App ${appid}`;
    const titleSource: SteamWishlistImportTitleSource = normalizedExtractedTitle
      ? normalizeTitleSource(source)
      : titleFromSlug
        ? 'slug'
        : 'placeholder';
    const existingIndex = itemIndexByAppId.get(appid);

    if (typeof existingIndex === 'number') {
      duplicateCount += 1;
      const existingItem = parsedItems[existingIndex];

      if (isPlaceholderSteamAppTitle(existingItem.name, appid) && !isPlaceholderSteamAppTitle(title, appid)) {
        parsedItems[existingIndex] = { ...existingItem, name: title, titleSource };
        console.info('[Steam Wishlist HTML Import] Repaired duplicate wishlist title from later match.', {
          appid,
          previousTitle: existingItem.name,
          title,
          titleSource,
        });
      } else {
        console.info('[Steam Wishlist HTML Import] Title source per item.', {
          appid,
          existingTitle: existingItem.name,
          duplicateTitle: title,
          titleSource,
          ignoredDuplicate: true,
        });
      }

      return;
    }

    itemIndexByAppId.set(appid, parsedItems.length);
    parsedItems.push({
      appid,
      name: title,
      storeUrl: `https://store.steampowered.com/app/${appid}`,
      titleSource,
    });

    const logPayload = { appid, title, titleSource, slug };
    if (titleSource === 'placeholder') {
      console.warn('[Steam Wishlist HTML Import] Title source per item: placeholder.', logPayload);
    } else {
      console.info('[Steam Wishlist HTML Import] Title source per item.', logPayload);
    }
  };

  for (const item of parseSteamWishlistDataScriptItems(input)) {
    addItem(item.appid.toString(), item.name, undefined, 'JSON');
  }

  const consumedRanges: Array<[number, number]> = [];

  for (const item of parseSteamWishlistTextLineItems(input)) {
    addItem(item.appid.toString(), item.name, item.slug, 'HTML');
    consumedRanges.push(item.consumedRange);
  }

  for (const item of parseSteamWishlistHtmlRowItems(input)) {
    addItem(item.appid.toString(), item.name, item.slug, 'HTML');
  }

  for (const match of input.matchAll(steamAppAnchorPattern)) {
    addItem(match[1], getTitleFromHtmlFragment(match[3]), match[2], 'HTML');
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

export async function repairSteamWishlistPlaceholderItems(items: ParsedSteamWishlistImportItem[]): Promise<ParsedSteamWishlistImportItem[]> {
  const repairedItems = await Promise.all(items.map(async (item) => {
    if (!isPlaceholderSteamAppTitle(item.name, item.appid)) {
      return item;
    }

    const fetchedTitle = await fetchSteamAppDetailsTitle(item.appid);

    if (!fetchedTitle) {
      console.warn('[Steam Wishlist HTML Import] Title source per item: placeholder.', {
        appid: item.appid,
        title: item.name,
        titleSource: 'placeholder',
      });
      return item;
    }

    console.info('[Steam Wishlist HTML Import] Title source per item.', {
      appid: item.appid,
      title: fetchedTitle,
      titleSource: 'appdetails',
    });

    return {
      ...item,
      name: fetchedTitle,
      titleSource: 'appdetails' as const,
    };
  }));

  console.info('[Steam Wishlist HTML Import] Placeholder count after import.', {
    placeholderCount: repairedItems.filter((item) => isPlaceholderSteamAppTitle(item.name, item.appid)).length,
  });

  return repairedItems;
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

function normalizeTitleSource(source: SteamWishlistImportTitleSource | 'text-line' | 'anchor-text' | 'store-url' | 'store-path' | 'plain-app-id'): SteamWishlistImportTitleSource {
  if (source === 'JSON' || source === 'DOM' || source === 'HTML' || source === 'appdetails' || source === 'placeholder') {
    return source;
  }

  return source === 'store-url' || source === 'store-path' || source === 'plain-app-id' ? 'slug' : 'HTML';
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

  return normalizeExtractedTitle(title);
}

function parseSteamWishlistDataScriptItems(input: string): ParsedSteamWishlistImportItem[] {
  const scriptPattern = /var\s+g_rgWishlistData\s*=\s*(\[.*?\]|\{.*?\});/gs;
  const items: ParsedSteamWishlistImportItem[] = [];

  for (const wishlistDataMatch of input.matchAll(scriptPattern)) {
    try {
      const payload = JSON.parse(wishlistDataMatch[1]) as unknown;
      const entries = Array.isArray(payload) ? payload.map((value) => [undefined, value] as const) : Object.entries(payload as Record<string, unknown>);

      entries.forEach(([fallbackAppId, value]) => {
        if (!value || typeof value !== 'object') {
          return;
        }

        const entry = value as Record<string, unknown>;
        const appid = getNumber(entry.appid) ?? getNumber(fallbackAppId);
        const name = getString(entry.name) ?? getString(entry.title);

        if (!appid || !name) {
          return;
        }

        items.push({ appid, name, storeUrl: `https://store.steampowered.com/app/${appid}`, titleSource: 'JSON' });
      });
    } catch (error) {
      console.warn('[Steam Wishlist HTML Import] Failed to parse Steam wishlist data script.', { error });
    }
  }

  return items;
}

function parseSteamWishlistTextLineItems(input: string): ParsedSteamWishlistTextLineItem[] {
  const items: ParsedSteamWishlistTextLineItem[] = [];
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
    const tabTitle = line.includes('\t') ? titleBeforeUrl.split('\t').at(-1) : undefined;
    const name = normalizeExtractedTitle(tabTitle) ?? normalizeExtractedTitle(titleBeforeUrl) ?? normalizeExtractedTitle(titleAfterUrl);

    if (!Number.isSafeInteger(appid) || appid <= 0) {
      continue;
    }

    items.push({
      appid,
      consumedRange: [lineMatch.index, lineMatch.index + line.length],
      name: name ?? `Steam App ${appid}`,
      slug: urlMatch[2],
      storeUrl: `https://store.steampowered.com/app/${appid}`,
      titleSource: name ? 'HTML' : 'placeholder',
    });
  }

  return items;
}

function parseSteamWishlistHtmlRowItems(input: string): Array<ParsedSteamWishlistImportItem & { slug?: string }> {
  if (!/[<][a-z][\s\S]*>/i.test(input)) {
    return [];
  }

  const items: Array<ParsedSteamWishlistImportItem & { slug?: string }> = [];
  const seen = new Set<number>();

  for (const match of input.matchAll(steamAppUrlPattern)) {
    const appid = Number(match[1]);

    if (!Number.isSafeInteger(appid) || appid <= 0 || seen.has(appid) || typeof match.index !== 'number') {
      continue;
    }

    const rowFragment = getNearbyHtmlRowFragment(input, match.index);
    const name = getTitleFromWishlistHtmlRowFragment(rowFragment, appid);

    if (name) {
      seen.add(appid);
      items.push({
        appid,
        name,
        slug: match[2],
        storeUrl: `https://store.steampowered.com/app/${appid}`,
        titleSource: 'HTML',
      });
    }
  }

  return items;
}

function getNearbyHtmlRowFragment(input: string, appUrlIndex: number) {
  const startCandidates = [
    input.lastIndexOf('<div', appUrlIndex),
    input.lastIndexOf('<li', appUrlIndex),
    input.lastIndexOf('<a', appUrlIndex),
    Math.max(0, appUrlIndex - 1500),
  ];
  const start = Math.max(0, Math.max(...startCandidates));
  const nextRowIndex = findNextRowBoundary(input, appUrlIndex + 1);
  const end = nextRowIndex > appUrlIndex ? nextRowIndex : Math.min(input.length, appUrlIndex + 3000);

  return input.slice(start, end);
}

function findNextRowBoundary(input: string, fromIndex: number) {
  const candidates = ['<div', '<li', '<a']
    .map((token) => input.indexOf(token, fromIndex))
    .filter((index) => index >= 0);

  if (candidates.length === 0) {
    return -1;
  }

  return Math.min(...candidates);
}

function getTitleFromWishlistHtmlRowFragment(fragment: string, appid: number) {
  const classTitle = getHtmlFragmentTextByClass(fragment, /(?:^|[\s_-])(title|name)(?:[\s_-]|$)/i);
  const imageTitle = getHtmlAttributeValue(fragment, /<img\b[^>]*(?:alt|title)=["']([^"']+)["'][^>]*>/i);
  const ariaOrTitle = getHtmlAttributeValue(fragment, /\b(?:aria-label|title)=["']([^"']+)["']/i);
  const nearbyText = getTitleFromHtmlFragment(fragment);

  return [classTitle, imageTitle, ariaOrTitle, nearbyText]
    .map((title) => normalizeExtractedTitle(title))
    .find((title) => title && !isPlaceholderSteamAppTitle(title, appid)) ?? null;
}

function getHtmlFragmentTextByClass(fragment: string, classNamePattern: RegExp) {
  const elementPattern = /<([a-z0-9-]+)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  for (const match of fragment.matchAll(elementPattern)) {
    const classValue = getHtmlAttributeValue(match[2], /\bclass=["']([^"']+)["']/i);

    if (classValue && classNamePattern.test(classValue)) {
      const title = getTitleFromHtmlFragment(match[3]);

      if (title) {
        return title;
      }
    }
  }

  return null;
}

function getHtmlAttributeValue(fragment: string, pattern: RegExp) {
  const match = fragment.match(pattern);
  return match ? decodeHtmlEntities(match[1]) : null;
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
    .replace(/\bAdd to wishlist\b/gi, ' ')
    .replace(/\bFollow\b|\bIgnore\b|\bNot Interested\b/gi, ' ')
    .replace(/\bAvailable\b|\bReleased\b/gi, ' ')
    .replace(/[|•·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title || /^[-–—:]+$/.test(title) || /^\d+$/.test(title) || /^Steam App \d+$/i.test(title)) {
    return null;
  }

  return title;
}

async function fetchSteamAppDetailsTitle(appid: number) {
  const directUrl = new URL('https://store.steampowered.com/api/appdetails');
  directUrl.searchParams.set('appids', appid.toString());
  directUrl.searchParams.set('filters', steamStoreAppDetailsFilters);
  const candidateUrls = [directUrl.toString()];

  if (typeof window !== 'undefined') {
    const proxyUrl = new URL('/api/steam-store/api/appdetails', window.location.origin);
    proxyUrl.searchParams.set('appids', appid.toString());
    proxyUrl.searchParams.set('filters', steamStoreAppDetailsFilters);
    candidateUrls.unshift(proxyUrl.toString());
  }

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        continue;
      }

      const payload = await response.json() as Record<string, { data?: { name?: unknown }; success?: boolean } | undefined>;
      const name = getString(payload[appid.toString()]?.data?.name);

      if (name) {
        return name;
      }
    } catch (error) {
      console.warn('[Steam Wishlist HTML Import] Failed to fetch Steam appdetails title.', { appid, url, error });
    }
  }

  return null;
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
