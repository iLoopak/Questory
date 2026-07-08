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
  source: MultiImportSource;
};

const supportedPlayStationPlatforms = new Set(['PS5', 'PS4', 'PS Plus']);

export const playStationLibraryBookmarklet = String.raw`javascript:(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const norm=s=>String(s||"").replace(/\s+/g," ").trim();const curPage=()=>Number(document.querySelector('[data-qa="pagination"] [aria-current="page"]')?.value||(location.pathname.match(/\/recently-purchased\/(\d+)/)||[])[1]||1);const waitChange=async old=>{for(let i=0;i<40;i++){await sleep(250);const now=[...document.querySelectorAll('[data-qa="collection-game-list-product#title"] span[id]')].map(x=>x.id+":"+norm(x.textContent)).join("|");if(now&&now!==old)return true}return false};const snap=()=>[...document.querySelectorAll('[data-qa="collection-game-list-product#title"] span[id]')].map(x=>x.id+":"+norm(x.textContent)).join("|");const pickImg=img=>{if(!img)return null;const ss=img.getAttribute("srcset");if(ss){const p=ss.split(",").map(x=>x.trim().split(" ")[0]).filter(Boolean);if(p.length)return p[p.length-1].replace(/&amp;/g,"&")}return(img.currentSrc||img.src||"").replace(/&amp;/g,"&")||null};const collect=()=>[...document.querySelectorAll('[data-qa="collection-game-list-product"]')].map(row=>{const titleEl=row.querySelector('[data-qa="collection-game-list-product#title"] span[id]')||row.querySelector('[data-qa="collection-game-list-product#title"] span');const title=norm(titleEl?.textContent);if(!title)return null;const platforms=[...row.querySelectorAll('[data-qa^="collection-game-list-product#platform-tags#tag"]')].map(x=>norm(x.textContent)).filter(Boolean);const service=norm(row.querySelector('[data-qa="collection-game-list-product#service-upsell#descriptorText"]')?.textContent);if(service&&!platforms.includes(service))platforms.push(service);const img=row.querySelector('[data-qa="collection-game-list-product#game-art#image#image"]')||row.querySelector('img[src*="image.api.playstation.com"]');const link=row.querySelector('[data-qa="collection-game-list-product#store-link"]');let telemetry={};try{telemetry=JSON.parse(link?.getAttribute("data-telemetry-meta")||"{}")}catch{}return{title,platforms,coverUrl:pickImg(img),productId:telemetry.productId||null,titleId:telemetry.titleId||titleEl?.id||null,storeUrl:link?.href||null,pageNumber:curPage()}}).filter(Boolean);const max=Math.max(curPage(),...[...document.querySelectorAll('[data-qa^="pagination#page"]')].map(b=>Number(b.value)).filter(Number.isFinite));const start=Number(prompt("Questory PS import: first page?",String(curPage())))||curPage();const end=Number(prompt("Questory PS import: last page?",String(max)))||max;const go=async p=>{const btn=document.querySelector('[data-qa="pagination#page'+p+'"]');if(!btn)return false;if(curPage()===p)return true;const old=snap();btn.click();return await waitChange(old)};const all=[];for(let p=start;p<=end;p++){const ok=await go(p);await sleep(500);all.push(...collect());if(!ok)console.warn("Questory: page navigation may have failed",p)}const seen=new Set();const games=[];for(const g of all){const key=(g.title+"|"+g.platforms.join(",")).toLowerCase();if(seen.has(key))continue;seen.add(key);games.push(g)}const payload={source:"playstation-library",version:1,pageUrl:location.href,pageRange:{start,end},exportedAt:new Date().toISOString(),games};const text=JSON.stringify(payload,null,2);try{await navigator.clipboard.writeText(text);alert("Questory: copied "+games.length+" PlayStation games from pages "+start+"-"+end+".")}catch(e){prompt("Copy this Questory PlayStation import JSON:",text)}})()`;


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
  root.games.forEach((game) => { const entry = game as { title?: unknown; platforms?: unknown; coverUrl?: unknown; rawTitle?: unknown }; const title = typeof entry.title === 'string' ? entry.title.trim() : ''; if (!title) { skippedCount += 1; return; } const platforms = Array.isArray(entry.platforms) ? entry.platforms.map(String).map((p) => p.trim()).filter(Boolean) : []; const safePlatforms = platforms.filter((p) => supportedPlayStationPlatforms.has(p)).length ? platforms.filter((p) => supportedPlayStationPlatforms.has(p)) : ['PlayStation']; const key = `${normalizeImportedTitle(title)}|${safePlatforms.join(',')}`; if (seen.has(key)) { duplicateCount += 1; return; } seen.add(key); items.push({ title, platforms: safePlatforms, coverUrl: typeof entry.coverUrl === 'string' ? entry.coverUrl : undefined, rawTitle: typeof entry.rawTitle === 'string' ? entry.rawTitle : undefined, source: 'playstation-library', pageUrl: typeof root.pageUrl === 'string' ? root.pageUrl : undefined, pageNumber: typeof root.pageNumber === 'number' ? root.pageNumber : undefined, exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : undefined }); });
  return { ok: items.length > 0, source: 'playstation-library', items, duplicateCount, skippedCount, error: items.length ? undefined : 'No PlayStation games were found in the JSON.' };
}

function parseNintendoVirtualGameCardsJson(root: { games: unknown[]; pageUrl?: unknown; exportedAt?: unknown }): MultiGameImportParseResult {
  const seen = new Set<string>(); const items: MultiGameImportItem[] = []; let duplicateCount = 0; let skippedCount = 0;
  root.games.forEach((game) => { const entry = game as { title?: unknown; coverUrl?: unknown; detailUrl?: unknown; vgcId?: unknown; rawTitle?: unknown; cardType?: unknown }; const title = typeof entry.title === 'string' ? entry.title.trim() : ''; if (!title) { skippedCount += 1; return; } const key = `${normalizeImportedTitle(title)}|Nintendo`; if (seen.has(key)) { duplicateCount += 1; return; } seen.add(key); const coverUrl = typeof entry.coverUrl === 'string' && entry.coverUrl.trim() ? entry.coverUrl.trim() : undefined; items.push({ title, platforms: ['Switch'], coverUrl, rawTitle: typeof entry.rawTitle === 'string' ? entry.rawTitle : undefined, source: 'nintendo-virtual-game-cards', pageUrl: typeof root.pageUrl === 'string' ? root.pageUrl : undefined, exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : undefined, nintendo: { source: 'nintendo-virtual-game-cards', version: 1, detailUrl: typeof entry.detailUrl === 'string' ? entry.detailUrl : undefined, vgcId: typeof entry.vgcId === 'string' ? entry.vgcId : undefined, cardType: typeof entry.cardType === 'string' ? entry.cardType : undefined, exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : undefined, pageUrl: typeof root.pageUrl === 'string' ? root.pageUrl : undefined, coverUrl } }); });
  return { ok: items.length > 0, source: 'nintendo-virtual-game-cards', items, duplicateCount, skippedCount, error: items.length ? undefined : 'No Nintendo Virtual Game Cards were found in the JSON.' };
}

function clearlyLooksLikeLineTitles(input: string) { return !/[{}[\]":]/.test(input) && input.split(/\r?\n/).filter((line) => line.trim()).length > 0; }

export function mergeMultiGameImport(currentGames: Game[], parsed: MultiGameImportParseResult, importedAt = new Date().toISOString()) {
  const nextGames = [...currentGames]; const existingIds = new Set(currentGames.map((game) => game.id));
  const summary: MultiGameImportSummary = { importedCount: 0, skippedDuplicates: parsed.duplicateCount, updatedExisting: 0, invalidRows: parsed.skippedCount, source: parsed.source };
  parsed.items.forEach((item) => {
    const existingIndex = findExistingImportMatch(nextGames, item);
    if (existingIndex >= 0) { const existing = nextGames[existingIndex]; const coverMissing = item.coverUrl && (!existing.coverImage || existing.artworkSource === 'generated-fallback'); const sourceMissing = !existing.externalSource || existing.externalSource === 'manual'; if (item.source !== 'plain text' && (coverMissing || sourceMissing || !existing.externalUrl || !existing.originalImportedTitle || (item.source === 'nintendo-virtual-game-cards' && item.nintendo && !existing.nintendoVirtualGameCard))) { nextGames[existingIndex] = { ...existing, coverImage: coverMissing ? item.coverUrl! : existing.coverImage, artworkSource: coverMissing ? 'imported' : existing.artworkSource, artworkUpdatedAt: coverMissing ? importedAt : existing.artworkUpdatedAt, externalSource: sourceMissing ? item.source : existing.externalSource, externalUrl: existing.externalUrl ?? item.nintendo?.detailUrl ?? item.pageUrl, originalImportedTitle: existing.originalImportedTitle ?? item.rawTitle, nintendoVirtualGameCard: existing.nintendoVirtualGameCard ?? item.nintendo, updatedAt: importedAt }; summary.updatedExisting += 1; } else summary.skippedDuplicates += 1; return; }
    const primaryPlatform = item.platforms[0] ?? 'Other'; let id = `${item.source === 'playstation-library' ? 'playstation' : item.source === 'nintendo-virtual-game-cards' ? 'nintendo' : 'manual-import'}-${slugify(item.title)}-${slugify(primaryPlatform)}`; let suffix = 2; while (existingIds.has(id)) { id = `${id}-${suffix}`; suffix += 1; } existingIds.add(id); nextGames.push({ id, title: item.title, platform: primaryPlatform, status: 'Want to play', coverImage: item.coverUrl ?? '', artworkSource: item.coverUrl ? 'imported' : undefined, artworkUpdatedAt: item.coverUrl ? importedAt : undefined, playtimeHours: 0, tags: item.source === 'playstation-library' ? ['imported', 'playstation'] : item.source === 'nintendo-virtual-game-cards' ? ['imported', 'nintendo'] : ['imported'], lastPlayedAt: null, notes: '', collectionType: 'library', externalSource: item.source === 'plain text' ? 'manual' : item.source, externalUrl: item.nintendo?.detailUrl ?? item.pageUrl, importedAt, originalImportedTitle: item.rawTitle, nintendoVirtualGameCard: item.nintendo }); summary.importedCount += 1;
  });
  return { games: nextGames, summary };
}

function findExistingImportMatch(games: Game[], item: MultiGameImportItem) { const title = normalizeImportedTitle(item.title); return games.findIndex((game) => { if (normalizeImportedTitle(game.title) !== title) return false; if (item.source === 'plain text') return true; const gamePlatform = String(game.platform); if (item.source === 'playstation-library') return (game.externalSource === 'playstation-library' || gamePlatform.startsWith('PS') || gamePlatform === 'PlayStation') && item.platforms.includes(gamePlatform); return (game.externalSource === 'nintendo-virtual-game-cards' || gamePlatform === 'Switch' || gamePlatform === 'Switch 2' || gamePlatform === 'Nintendo'); }); }
function slugify(value: string) { return normalizeImportedTitle(value).replace(/\s+/g, '-') || 'game'; }
