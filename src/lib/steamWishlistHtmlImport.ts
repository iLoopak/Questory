import type { SteamWishlistItem } from '../types/steam';

export type ParsedSteamWishlistImportItem = Pick<SteamWishlistItem, 'appid' | 'name' | 'storeUrl'>;

export type SteamWishlistHtmlParseResult = {
  items: ParsedSteamWishlistImportItem[];
  duplicateCount: number;
  skippedCount: number;
};

const steamAppUrlPattern = /https?:\/\/(?:store\.)?steampowered\.com\/app\/(\d+)(?:\/([^\s"'<>?#]*))?/gi;
const steamAppPathPattern = /\/app\/(\d+)(?:\/([^\s"'<>?#]*))?/gi;
const plainAppIdLinePattern = /^\s*([1-9]\d{1,9})\s*$/gm;

export const steamWishlistBookmarklet = `javascript:(async()=>{const sleep=t=>new Promise(r=>setTimeout(r,t));const seen=new Set();const collect=()=>{document.querySelectorAll('a[href*="store.steampowered.com/app/"]').forEach(a=>{const m=a.href.match(/\\/app\\/(\\d+)/);if(m)seen.add(m[1]);});};const getScroller=()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+300);return els.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight))[0]||document.scrollingElement||document.documentElement;};let scroller=getScroller();let stable=0,last=0;for(let i=0;i<250;i++){collect();scroller=getScroller();const step=Math.max(500,Math.floor(scroller.clientHeight*0.65));scroller.scrollTop=Math.min(scroller.scrollTop+step,scroller.scrollHeight);window.scrollBy(0,step);await sleep(1200);collect();if(seen.size===last)stable++;else stable=0;last=seen.size;if(stable>=12)break;}const out=[...seen].sort((a,b)=>Number(a)-Number(b)).map(id=>\`https://store.steampowered.com/app/\${id}/\`).join('\\n');try{await navigator.clipboard.writeText(out);alert(\`QuestShelf: copied \${seen.size} Steam wishlist links to clipboard.\`);}catch(e){const ta=document.createElement('textarea');ta.value=out;ta.style='position:fixed;z-index:999999;top:20px;left:20px;width:80vw;height:70vh;background:#111;color:#fff;padding:16px;font:14px monospace;';document.body.appendChild(ta);ta.focus();ta.select();alert(\`QuestShelf: found \${seen.size} links. Copy them from the textarea.\`);}})()`;

export function parseSteamWishlistHtmlText(input: string): ParsedSteamWishlistImportItem[] {
  return parseSteamWishlistHtmlTextWithSummary(input).items;
}

export function parseSteamWishlistHtmlTextWithSummary(input: string): SteamWishlistHtmlParseResult {
  const parsedItems: ParsedSteamWishlistImportItem[] = [];
  const seenAppIds = new Set<number>();
  let duplicateCount = 0;
  let skippedCount = 0;

  const addItem = (appidText: string | undefined, slug?: string) => {
    const appid = Number(appidText);

    if (!Number.isSafeInteger(appid) || appid <= 0) {
      skippedCount += 1;
      return;
    }

    if (seenAppIds.has(appid)) {
      duplicateCount += 1;
      return;
    }

    seenAppIds.add(appid);
    parsedItems.push({
      appid,
      name: getTitleFromSteamSlug(slug) ?? `Steam App ${appid}`,
      storeUrl: `https://store.steampowered.com/app/${appid}`,
    });
  };

  const consumedRanges: Array<[number, number]> = [];

  for (const match of input.matchAll(steamAppUrlPattern)) {
    addItem(match[1], match[2]);
    if (typeof match.index === 'number') {
      consumedRanges.push([match.index, match.index + match[0].length]);
    }
  }

  const inputWithoutFullUrls = maskConsumedRanges(input, consumedRanges);

  for (const match of inputWithoutFullUrls.matchAll(steamAppPathPattern)) {
    addItem(match[1], match[2]);
    if (typeof match.index === 'number') {
      consumedRanges.push([match.index, match.index + match[0].length]);
    }
  }

  const remainingInput = maskConsumedRanges(input, consumedRanges);

  for (const match of remainingInput.matchAll(plainAppIdLinePattern)) {
    addItem(match[1]);
  }

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

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
