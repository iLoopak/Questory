import type { Game, GamePlatform } from '../types/game';

export type MultiImportSource = 'plain text' | 'playstation-library';

export type MultiGameImportItem = {
  title: string;
  platforms: GamePlatform[];
  coverUrl?: string;
  rawTitle?: string;
  source: MultiImportSource;
  pageUrl?: string;
  pageNumber?: number;
  exportedAt?: string;
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

export const playStationLibraryBookmarklet = String.raw`javascript:(async()=>{const norm=t=>(t||'').replace(/[™®©]/g,'').replace(/[^a-z0-9]+/gi,' ').replace(/\s+/g,' ').trim().toLowerCase();const text=e=>(e&&e.innerText||e&&e.textContent||'').replace(/\s+/g,' ').trim();const visible=e=>!!(e&&e.getClientRects&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');const bestImg=img=>{if(!img)return'';const srcset=img.getAttribute('srcset')||'';const candidates=srcset.split(',').map(s=>s.trim().split(/\s+/)[0]).filter(Boolean);return candidates.find(u=>/image\.api\.playstation\.com/i.test(u))||candidates.pop()||img.currentSrc||img.src||'';};const pageNumber=Number((location.pathname.match(/\/recently-purchased\/(\d+)\/?$/)||[])[1]||'1');const arts=[...document.querySelectorAll('[data-qa="collection-game-list-product#game-art"]')].filter(visible);const seen=new Set();const games=[];for(const art of arts){const card=art.closest('li,article,[role="listitem"],[data-qa*="collection-game-list-product"],div')||art.parentElement;const scope=card||art;const img=art.querySelector('[data-qa="collection-game-list-product#game-art#image#image"],img')||art.querySelector('img');const raw=text(scope);const platforms=[...new Set((raw.match(/\bPS5\b|\bPS4\b|PS\s*Plus/gi)||[]).map(p=>/plus/i.test(p)?'PS Plus':p.toUpperCase()))];const imgAlt=(img&&img.getAttribute('alt')||'').trim();let title=imgAlt||'';if(!title){const clone=scope.cloneNode(true);clone.querySelectorAll('img,svg,button,a[href*="recently-purchased"],[aria-label*="page" i]').forEach(n=>n.remove());let lines=(clone.innerText||clone.textContent||'').split('\n').map(s=>s.trim()).filter(Boolean).filter(s=>!/^PS5$|^PS4$|^PS Plus$/i.test(s));title=lines.sort((a,b)=>b.length-a.length)[0]||'';}title=title.replace(/\s+/g,' ').trim();const usablePlatforms=platforms.length?platforms:['PlayStation'];if(!title)continue;const key=norm(title)+'|'+usablePlatforms.join(',');if(seen.has(key))continue;seen.add(key);games.push({title,platforms:usablePlatforms,coverUrl:bestImg(img),rawTitle:raw&&raw!==title?raw:undefined});}const out={source:'playstation-library',version:1,pageUrl:location.href,pageNumber,exportedAt:new Date().toISOString(),games};try{await navigator.clipboard.writeText(JSON.stringify(out,null,2));alert('Questory: copied '+games.length+' PlayStation Library games from page '+pageNumber+'.');}catch(e){const ta=document.createElement('textarea');ta.value=JSON.stringify(out,null,2);ta.style='position:fixed;z-index:999999;top:20px;left:20px;width:80vw;height:70vh;background:#111;color:#fff;padding:16px;font:14px monospace;';document.body.appendChild(ta);ta.focus();ta.select();alert('Questory: found '+games.length+' games on page '+pageNumber+'. Copy them from the textarea.');}})()`;

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
  if (root?.source !== 'playstation-library' || root.version !== 1 || !Array.isArray(root.games)) return { ok: false, source: 'plain text', items: [], duplicateCount: 0, skippedCount: 1, error: 'Unsupported import JSON. Supported source: playstation-library version 1.' };
  const seen = new Set<string>(); const items: MultiGameImportItem[] = []; let duplicateCount = 0; let skippedCount = 0;
  root.games.forEach((game) => { const entry = game as { title?: unknown; platforms?: unknown; coverUrl?: unknown; rawTitle?: unknown }; const title = typeof entry.title === 'string' ? entry.title.trim() : ''; if (!title) { skippedCount += 1; return; } const platforms = Array.isArray(entry.platforms) ? entry.platforms.map(String).map((p) => p.trim()).filter(Boolean) : []; const safePlatforms = platforms.filter((p) => supportedPlayStationPlatforms.has(p)).length ? platforms.filter((p) => supportedPlayStationPlatforms.has(p)) : ['PlayStation']; const key = `${normalizeImportedTitle(title)}|${safePlatforms.join(',')}`; if (seen.has(key)) { duplicateCount += 1; return; } seen.add(key); items.push({ title, platforms: safePlatforms, coverUrl: typeof entry.coverUrl === 'string' ? entry.coverUrl : undefined, rawTitle: typeof entry.rawTitle === 'string' ? entry.rawTitle : undefined, source: 'playstation-library', pageUrl: typeof root.pageUrl === 'string' ? root.pageUrl : undefined, pageNumber: typeof root.pageNumber === 'number' ? root.pageNumber : undefined, exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : undefined }); });
  return { ok: items.length > 0, source: 'playstation-library', items, duplicateCount, skippedCount, error: items.length ? undefined : 'No PlayStation games were found in the JSON.' };
}

function clearlyLooksLikeLineTitles(input: string) { return !/[{}[\]":]/.test(input) && input.split(/\r?\n/).filter((line) => line.trim()).length > 0; }

export function mergeMultiGameImport(currentGames: Game[], parsed: MultiGameImportParseResult, importedAt = new Date().toISOString()) {
  const nextGames = [...currentGames]; const existingIds = new Set(currentGames.map((game) => game.id));
  const summary: MultiGameImportSummary = { importedCount: 0, skippedDuplicates: parsed.duplicateCount, updatedExisting: 0, invalidRows: parsed.skippedCount, source: parsed.source };
  parsed.items.forEach((item) => {
    const existingIndex = findExistingImportMatch(nextGames, item);
    if (existingIndex >= 0) { const existing = nextGames[existingIndex]; const coverMissing = item.coverUrl && (!existing.coverImage || existing.artworkSource === 'generated-fallback'); if (item.source === 'playstation-library' && (coverMissing || existing.externalSource !== 'playstation-library')) { nextGames[existingIndex] = { ...existing, coverImage: coverMissing ? item.coverUrl! : existing.coverImage, artworkSource: coverMissing ? 'imported' : existing.artworkSource, artworkUpdatedAt: coverMissing ? importedAt : existing.artworkUpdatedAt, externalSource: existing.externalSource ?? 'playstation-library', externalUrl: existing.externalUrl ?? item.pageUrl, originalImportedTitle: existing.originalImportedTitle ?? item.rawTitle, updatedAt: importedAt }; summary.updatedExisting += 1; } else summary.skippedDuplicates += 1; return; }
    const primaryPlatform = item.platforms[0] ?? 'Other'; let id = `${item.source === 'playstation-library' ? 'playstation' : 'manual-import'}-${slugify(item.title)}-${slugify(primaryPlatform)}`; let suffix = 2; while (existingIds.has(id)) { id = `${id}-${suffix}`; suffix += 1; } existingIds.add(id); nextGames.push({ id, title: item.title, platform: primaryPlatform, status: 'Want to play', coverImage: item.coverUrl ?? '', artworkSource: item.coverUrl ? 'imported' : undefined, artworkUpdatedAt: item.coverUrl ? importedAt : undefined, playtimeHours: 0, tags: item.source === 'playstation-library' ? ['imported', 'playstation'] : ['imported'], lastPlayedAt: null, notes: '', collectionType: 'library', externalSource: item.source === 'playstation-library' ? 'playstation-library' : 'manual', externalUrl: item.pageUrl, importedAt, originalImportedTitle: item.rawTitle }); summary.importedCount += 1;
  });
  return { games: nextGames, summary };
}

function findExistingImportMatch(games: Game[], item: MultiGameImportItem) { const title = normalizeImportedTitle(item.title); return games.findIndex((game) => { if (normalizeImportedTitle(game.title) !== title) return false; if (item.source === 'plain text') return true; const gamePlatform = String(game.platform); return (game.externalSource === 'playstation-library' || gamePlatform.startsWith('PS') || gamePlatform === 'PlayStation') && item.platforms.includes(gamePlatform); }); }
function slugify(value: string) { return normalizeImportedTitle(value).replace(/\s+/g, '-') || 'game'; }
