import type { Game, GamePlatform } from '../types/game';

export type MultiImportSource = 'plain text' | 'playstation-library' | 'nintendo-virtual-game-cards';

export type MultiGameImportItem = {
  title: string;
  platforms: GamePlatform[];
  coverUrl?: string;
  rawTitle?: string;
  source: MultiImportSource;
  pageUrl?: string;
  pageNumber?: number;
  exportedAt?: string;
  playStation?: {
    productId?: string;
    titleId?: string;
    storeUrl?: string;
    aliases?: string[];
  };
  nintendo?: {
    source: 'nintendo-virtual-game-cards';
    version: 1;
    detailUrl?: string;
    vgcId?: string;
    cardType?: 'game' | 'dlc-or-addon' | 'unknown' | (string & {});
    exportedAt?: string;
    pageUrl?: string;
    coverUrl?: string;
  };
};

export type MultiGameImportParseResult = {
  ok: boolean;
  source: MultiImportSource;
  items: MultiGameImportItem[];
  duplicateCount: number;
  skippedCount: number;
  error?: string;
};

export type MultiGameImportSummary = {
  importedCount: number;
  skippedDuplicates: number;
  updatedExisting: number;
  invalidRows: number;
  ambiguousCount: number;
  source: MultiImportSource;
};

const supportedPlayStationPlatforms = new Set(['PS5', 'PS4', 'PS Plus']);
const supportedNintendoPlatforms = new Set(['Switch', 'Switch 2', 'Nintendo']);

export const playStationLibraryBookmarklet = String.raw`javascript:(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const norm=s=>String(s||"").replace(/\s+/g," ").trim();const curPage=()=>Number(document.querySelector('[data-qa="pagination"] [aria-current="page"]')?.value||(location.pathname.match(/\/recently-purchased\/(\d+)/)||[])[1]||1);const waitChange=async old=>{for(let i=0;i<40;i++){await sleep(250);const now=[...document.querySelectorAll('[data-qa="collection-game-list-product#title"] span[id]')].map(x=>x.id+":"+norm(x.textContent)).join("|");if(now&&now!==old)return true}return false};const snap=()=>[...document.querySelectorAll('[data-qa="collection-game-list-product#title"] span[id]')].map(x=>x.id+":"+norm(x.textContent)).join("|");const pickImg=img=>{if(!img)return null;const ss=img.getAttribute("srcset");if(ss){const p=ss.split(",").map(x=>x.trim().split(" ")[0]).filter(Boolean);if(p.length)return p[p.length-1].replace(/&amp;/g,"&")}return(img.currentSrc||img.src||"").replace(/&amp;/g,"&")||null};const collect=()=>[...document.querySelectorAll('[data-qa="collection-game-list-product"]')].map(row=>{const titleEl=row.querySelector('[data-qa="collection-game-list-product#title"] span[id]')||row.querySelector('[data-qa="collection-game-list-product#title"] span');const title=norm(titleEl?.textContent);if(!title)return null;const platforms=[...row.querySelectorAll('[data-qa^="collection-game-list-product#platform-tags#tag"]')].map(x=>norm(x.textContent)).filter(Boolean);const service=norm(row.querySelector('[data-qa="collection-game-list-product#service-upsell#descriptorText"]')?.textContent);if(service&&!platforms.includes(service))platforms.push(service);const img=row.querySelector('[data-qa="collection-game-list-product#game-art#image#image"]')||row.querySelector('img[src*="image.api.playstation.com"]');const link=row.querySelector('[data-qa="collection-game-list-product#store-link"]');let telemetry={};try{telemetry=JSON.parse(link?.getAttribute("data-telemetry-meta")||"{}")}catch{}return{title,platforms,coverUrl:pickImg(img),productId:telemetry.productId||null,titleId:telemetry.titleId||titleEl?.id||null,storeUrl:link?.href||null,pageNumber:curPage()}}).filter(Boolean);const max=Math.max(curPage(),...[...document.querySelectorAll('[data-qa^="pagination#page"]')].map(b=>Number(b.value)).filter(Number.isFinite));const start=Number(prompt("Questory PS import: first page?",String(curPage())))||curPage();const end=Number(prompt("Questory PS import: last page?",String(max)))||max;const go=async p=>{const btn=document.querySelector('[data-qa="pagination#page'+p+'"]');if(!btn)return false;if(curPage()===p)return true;const old=snap();btn.click();return await waitChange(old)};const all=[];for(let p=start;p<=end;p++){const ok=await go(p);await sleep(500);all.push(...collect());if(!ok)console.warn("Questory: page navigation may have failed",p)}const seen=new Set();const games=[];for(const g of all){const key=(g.productId||g.titleId||g.title+"|"+g.platforms.join(",")).toLowerCase();if(seen.has(key))continue;seen.add(key);games.push(g)}const payload={source:"playstation-library",version:1,pageUrl:location.href,pageRange:{start,end},exportedAt:new Date().toISOString(),games};const text=JSON.stringify(payload,null,2);try{await navigator.clipboard.writeText(text);alert("Questory: copied "+games.length+" PlayStation games from pages "+start+"-"+end+".")}catch(e){prompt("Copy this Questory PlayStation import JSON:",text)}})()`;


export const nintendoVirtualGameCardsBookmarklet = String.raw`javascript:(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const norm=s=>String(s||"").replace(/\s+/g," ").trim();const abs=u=>{try{return new URL(u,location.origin).href}catch{return u||null}};const collect=()=>{const rows=[...document.querySelectorAll(".vgcsVgcList_listItem")];return rows.map(row=>{const link=row.querySelector('a.vgcsVgcList_vgc[href*="/portal/vgcs/detail"]');const img=row.querySelector("img.virtualGameCard_thumb");const title=norm(img?.getAttribute("alt"));if(!title)return null;const detailUrl=abs(link?.getAttribute("href"));let vgcId=null;try{vgcId=new URL(detailUrl).searchParams.get("vgc_id")}catch{}const frame=row.querySelector("img.virtualGameCard_frame");const frameSrc=frame?.getAttribute("src")||"";const cardType=frameSrc.includes("frame_dlc")?"dlc-or-addon":"game";return{title,rawTitle:title,coverUrl:abs(img?.getAttribute("src")),detailUrl,vgcId,cardType}}).filter(Boolean)};let last=-1,same=0;for(let i=0;i<40;i++){window.scrollTo(0,document.body.scrollHeight);await sleep(350);const count=collect().length;if(count===last)same++;else same=0;last=count;if(same>=4)break}window.scrollTo(0,0);const seen=new Set();const games=[];for(const g of collect()){const key=(g.title+"|"+(g.vgcId||"")).toLowerCase();if(seen.has(key))continue;seen.add(key);games.push(g)}const payload={source:"nintendo-virtual-game-cards",version:1,pageUrl:location.href,exportedAt:new Date().toISOString(),games};const text=JSON.stringify(payload,null,2);try{await navigator.clipboard.writeText(text);alert("Questory: copied "+games.length+" Nintendo Virtual Game Cards.")}catch(e){prompt("Copy this Questory Nintendo import JSON:",text)}})();`;

export function normalizeImportedTitle(title: string) {
  return title.trim().toLowerCase().replace(/[™®©]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseMultiGameImportInput(input: string): MultiGameImportParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, source: 'plain text', items: [], duplicateCount: 0, skippedCount: 0, error: 'Paste one or more game titles or supported import JSON.' };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return parseStructuredJson(JSON.parse(trimmed)); }
    catch { if (!clearlyLooksLikeLineTitles(trimmed)) return { ok: false, source: 'plain text', items: [], duplicateCount: 0, skippedCount: 1, error: 'That looks like JSON, but Questory could not parse it. Paste valid supported JSON or one title per line.' }; }
  }
  return parsePlainTextTitles(input);
}

function parsePlainTextTitles(input: string): MultiGameImportParseResult {
  const seen = new Set<string>(); const items: MultiGameImportItem[] = []; let duplicateCount = 0; let skippedCount = 0;
  input.split(/\r?\n/).forEach((line) => { const title = line.trim(); if (!title) { skippedCount += 1; return; } const key = normalizeImportedTitle(title); if (!key) { skippedCount += 1; return; } if (seen.has(key)) { duplicateCount += 1; return; } seen.add(key); items.push({ title, platforms: ['Other'], source: 'plain text' }); });
  return { ok: items.length > 0, source: 'plain text', items, duplicateCount, skippedCount, error: items.length ? undefined : 'No game titles were found.' };
}

function parseStructuredJson(value: unknown): MultiGameImportParseResult {
  const root = value as { source?: unknown; version?: unknown; games?: unknown; pageUrl?: unknown; pageNumber?: unknown; exportedAt?: unknown };
  if (root?.source === 'playstation-library' && root.version === 1 && Array.isArray(root.games)) return parsePlayStationLibraryJson({ ...root, games: root.games });
  if (root?.source === 'nintendo-virtual-game-cards' && root.version === 1 && Array.isArray(root.games)) return parseNintendoVirtualGameCardsJson({ ...root, games: root.games });
  return { ok: false, source: 'plain text', items: [], duplicateCount: 0, skippedCount: 1, error: 'Unsupported import JSON. Supported sources: playstation-library version 1, nintendo-virtual-game-cards version 1.' };
}

function parsePlayStationLibraryJson(root: { games: unknown[]; pageUrl?: unknown; pageNumber?: unknown; exportedAt?: unknown }): MultiGameImportParseResult {
  const seen = new Set<string>(); const items: MultiGameImportItem[] = []; let duplicateCount = 0; let skippedCount = 0;
  root.games.forEach((game) => {
    const entry = game as { title?: unknown; platforms?: unknown; coverUrl?: unknown; rawTitle?: unknown; productId?: unknown; titleId?: unknown; storeUrl?: unknown };
    const title = textValue(entry.title); if (!title) { skippedCount += 1; return; }
    const platforms = Array.isArray(entry.platforms) ? entry.platforms.map(String).map((p) => p.trim()).filter(Boolean) : [];
    const supported = platforms.filter((p) => supportedPlayStationPlatforms.has(p));
    const safePlatforms = supported.length ? supported : ['PlayStation'];
    const productId = textValue(entry.productId); const titleId = textValue(entry.titleId); const storeUrl = textValue(entry.storeUrl);
    const stableId = normalizeSourceId(productId || titleId);
    const key = stableId ? `id:${stableId}` : `title:${normalizeImportedTitle(title)}|${safePlatforms.join(',')}`;
    if (seen.has(key)) { duplicateCount += 1; return; } seen.add(key);
    items.push({ title, platforms: safePlatforms, coverUrl: textValue(entry.coverUrl), rawTitle: textValue(entry.rawTitle), source: 'playstation-library', pageUrl: textValue(root.pageUrl), pageNumber: typeof root.pageNumber === 'number' ? root.pageNumber : undefined, exportedAt: textValue(root.exportedAt), playStation: { productId, titleId, storeUrl } });
  });
  return { ok: items.length > 0, source: 'playstation-library', items, duplicateCount, skippedCount, error: items.length ? undefined : 'No PlayStation games were found in the JSON.' };
}

function parseNintendoVirtualGameCardsJson(root: { games: unknown[]; pageUrl?: unknown; exportedAt?: unknown }): MultiGameImportParseResult {
  const seen = new Set<string>(); const items: MultiGameImportItem[] = []; let duplicateCount = 0; let skippedCount = 0;
  root.games.forEach((game) => { const entry = game as { title?: unknown; platforms?: unknown; platform?: unknown; coverUrl?: unknown; detailUrl?: unknown; vgcId?: unknown; rawTitle?: unknown; cardType?: unknown }; const title = textValue(entry.title); if (!title) { skippedCount += 1; return; } const vgcId = textValue(entry.vgcId); const requestedPlatforms = Array.isArray(entry.platforms) ? entry.platforms.map(String) : typeof entry.platform === 'string' ? [entry.platform] : []; const safePlatforms = requestedPlatforms.filter((platform) => supportedNintendoPlatforms.has(platform)); const platforms = safePlatforms.length ? safePlatforms : ['Switch']; const key = vgcId ? `id:${normalizeSourceId(vgcId)}` : `${normalizeImportedTitle(title)}|${platforms.join(',')}`; if (seen.has(key)) { duplicateCount += 1; return; } seen.add(key); const coverUrl = textValue(entry.coverUrl); items.push({ title, platforms, coverUrl, rawTitle: textValue(entry.rawTitle), source: 'nintendo-virtual-game-cards', pageUrl: textValue(root.pageUrl), exportedAt: textValue(root.exportedAt), nintendo: { source: 'nintendo-virtual-game-cards', version: 1, detailUrl: textValue(entry.detailUrl), vgcId, cardType: typeof entry.cardType === 'string' ? entry.cardType : undefined, exportedAt: textValue(root.exportedAt), pageUrl: textValue(root.pageUrl), coverUrl } }); });
  return { ok: items.length > 0, source: 'nintendo-virtual-game-cards', items, duplicateCount, skippedCount, error: items.length ? undefined : 'No Nintendo Virtual Game Cards were found in the JSON.' };
}

function clearlyLooksLikeLineTitles(input: string) { return !/[{}[\]":]/.test(input) && input.split(/\r?\n/).filter((line) => line.trim()).length > 0; }

export function mergeMultiGameImport(currentGames: Game[], parsed: MultiGameImportParseResult, importedAt = new Date().toISOString()) {
  const nextGames = [...currentGames]; const existingIds = new Set(currentGames.map((game) => game.id));
  const summary: MultiGameImportSummary = { importedCount: 0, skippedDuplicates: parsed.duplicateCount, updatedExisting: 0, invalidRows: parsed.skippedCount, ambiguousCount: 0, source: parsed.source };
  parsed.items.forEach((item) => {
    const match = findExistingImportMatch(nextGames, item);
    if (match.kind === 'ambiguous') { summary.ambiguousCount += 1; return; }
    if (match.kind === 'match') {
      const existing = nextGames[match.index];
      const coverMissing = Boolean(item.coverUrl) && (!existing.coverImage || existing.artworkSource === 'generated-fallback');
      const sourceMissing = !existing.externalSource || existing.externalSource === 'manual';
      const incomingExternalUrl = item.playStation?.storeUrl ?? item.nintendo?.detailUrl ?? item.pageUrl;
      const incomingOriginalTitle = item.rawTitle ?? item.title;
      const playStationSource = mergePlayStationSource(existing.playStationSource, item.playStation);
      const nintendoSource = mergeNintendoSource(existing.nintendoVirtualGameCard, item.nintendo);
      const changed = item.source !== 'plain text' && (coverMissing || sourceMissing || Boolean(incomingExternalUrl && !existing.externalUrl) || Boolean(incomingOriginalTitle && !existing.originalImportedTitle) || playStationSource !== existing.playStationSource || nintendoSource !== existing.nintendoVirtualGameCard);
      if (changed) {
        nextGames[match.index] = { ...existing, coverImage: coverMissing ? item.coverUrl! : existing.coverImage, artworkSource: coverMissing ? 'imported' : existing.artworkSource, artworkUpdatedAt: coverMissing ? importedAt : existing.artworkUpdatedAt, externalSource: sourceMissing ? item.source === 'plain text' ? 'manual' : item.source : existing.externalSource, externalUrl: existing.externalUrl ?? incomingExternalUrl, originalImportedTitle: existing.originalImportedTitle ?? incomingOriginalTitle, playStationSource, nintendoVirtualGameCard: nintendoSource, updatedAt: importedAt };
        summary.updatedExisting += 1;
      } else summary.skippedDuplicates += 1;
      return;
    }
    const primaryPlatform = item.platforms[0] ?? 'Other'; let id = `${item.source === 'playstation-library' ? 'playstation' : item.source === 'nintendo-virtual-game-cards' ? 'nintendo' : 'manual-import'}-${slugify(item.title)}-${slugify(primaryPlatform)}`; let suffix = 2; while (existingIds.has(id)) { id = `${id}-${suffix}`; suffix += 1; } existingIds.add(id); nextGames.push({ id, title: item.title, platform: primaryPlatform, status: 'Want to play', coverImage: item.coverUrl ?? '', artworkSource: item.coverUrl ? 'imported' : undefined, artworkUpdatedAt: item.coverUrl ? importedAt : undefined, playtimeHours: 0, tags: item.source === 'playstation-library' ? ['imported', 'playstation'] : item.source === 'nintendo-virtual-game-cards' ? ['imported', 'nintendo'] : ['imported'], lastPlayedAt: null, notes: '', collectionType: 'library', externalSource: item.source === 'plain text' ? 'manual' : item.source, externalUrl: item.playStation?.storeUrl ?? item.nintendo?.detailUrl ?? item.pageUrl, playStationSource: item.playStation, importedAt, originalImportedTitle: item.rawTitle ?? item.title, nintendoVirtualGameCard: item.nintendo }); summary.importedCount += 1;
  });
  return { games: nextGames, summary };
}

type ImportMatch = { kind: 'match'; index: number } | { kind: 'none' } | { kind: 'ambiguous' };

function findExistingImportMatch(games: Game[], item: MultiGameImportItem): ImportMatch {
  if (item.source === 'plain text') return uniqueMatch(games, (game) => normalizeImportedTitle(game.title) === normalizeImportedTitle(item.title));
  if (item.source === 'playstation-library') {
    const stableIds = [item.playStation?.productId, item.playStation?.titleId].map(normalizeSourceId).filter(Boolean);
    if (stableIds.length) return uniqueMatch(games, (game) => getPlayStationIds(game).some((id) => stableIds.includes(id)));
    return uniqueMatch(games, (game) => isPlayStationGame(game) && platformsOverlap(game.platform, item.platforms) && normalizeImportedTitle(game.title) === normalizeImportedTitle(item.title));
  }
  const vgcId = normalizeSourceId(item.nintendo?.vgcId);
  if (vgcId) return uniqueMatch(games, (game) => normalizeSourceId(game.nintendoVirtualGameCard?.vgcId) === vgcId);
  return uniqueMatch(games, (game) => isNintendoGame(game) && platformsOverlap(game.platform, item.platforms) && normalizeImportedTitle(game.title) === normalizeImportedTitle(item.title));
}

function uniqueMatch(games: Game[], predicate: (game: Game) => boolean): ImportMatch { const matches = games.map((game, index) => predicate(game) ? index : -1).filter((index) => index >= 0); return matches.length === 1 ? { kind: 'match', index: matches[0] } : matches.length > 1 ? { kind: 'ambiguous' } : { kind: 'none' }; }
function normalizeSourceId(value: unknown) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function textValue(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function getPlayStationIds(game: Game) { return [game.playStationSource?.productId, game.playStationSource?.titleId, ...(game.playStationSource?.aliases ?? [])].map(normalizeSourceId).filter(Boolean); }
function isPlayStationGame(game: Game) { const platform = String(game.platform); return game.externalSource === 'playstation-library' || platform.startsWith('PS') || platform === 'PlayStation'; }
function isNintendoGame(game: Game) { const platform = String(game.platform); return game.externalSource === 'nintendo-virtual-game-cards' || platform === 'Switch' || platform === 'Switch 2' || platform === 'Nintendo'; }
function platformsOverlap(platform: GamePlatform, candidates: GamePlatform[]) { return candidates.includes(platform) || candidates.includes('PlayStation') && String(platform).startsWith('PS') || platform === 'PlayStation' && candidates.some((candidate) => String(candidate).startsWith('PS')) || candidates.includes('Switch') && (platform === 'Switch 2' || platform === 'Nintendo'); }
function mergePlayStationSource(existing: Game['playStationSource'], incoming: MultiGameImportItem['playStation']) { if (!incoming) return existing; const next = { ...existing, ...incoming }; const aliases = Array.from(new Set([...(existing?.aliases ?? []), ...(incoming.aliases ?? [])])); if (aliases.length) next.aliases = aliases; else delete next.aliases; return JSON.stringify(next) === JSON.stringify(existing) ? existing : next; }
function mergeNintendoSource(existing: Game['nintendoVirtualGameCard'], incoming: MultiGameImportItem['nintendo']) { if (!incoming) return existing; const next = { ...existing, ...incoming } as Game['nintendoVirtualGameCard']; return JSON.stringify(next) === JSON.stringify(existing) ? existing : next; }
function slugify(value: string) { return normalizeImportedTitle(value).replace(/\s+/g, '-') || 'game'; }
