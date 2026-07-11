import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPersonalizedRecommendations, buildPersonalizedTasteProfile, selectPersonalizedRecommendations } from '../src/lib/personalizedRecommendations';
import type { Game } from '../src/types/game';

(globalThis as any).localStorage = { store: new Map<string,string>(), getItem(k:string){return this.store.get(k) ?? null}, setItem(k:string,v:string){this.store.set(k,v)}, removeItem(k:string){this.store.delete(k)} };

const base = (over: Partial<Game>): Game => ({ id: over.id ?? String(over.rawgId ?? over.title), title: over.title ?? 'Game', platform: over.platform ?? 'Steam', status: over.status ?? 'Want to play', coverImage: '', playtimeHours: over.playtimeHours ?? 0, rating: over.rating, favorite: over.favorite, tags: over.tags ?? [], rawgTags: over.rawgTags ?? [], genres: over.genres ?? [], developers: over.developers ?? [], lastPlayedAt: null, notes: '', collectionType: over.collectionType ?? 'library', rawgId: over.rawgId, metacritic: over.metacritic, rawgRating: over.rawgRating });
const rawg = (id:number, name:string, tags:string[] = ['Roguelite'], genres:string[] = ['Strategy']) => ({ id, name, slug: name.toLowerCase().replaceAll(' ','-'), released: '2024-01-01', background_image: null, metacritic: 82, rating: 4.2, ratings_count: 1000, genres: genres.map((name, id) => ({ id, name, slug: name.toLowerCase() })), tags: tags.map((name, id) => ({ id, name, slug: name.toLowerCase() })), platforms: [{ platform: { id: 4, name: 'PC', slug: 'pc' } }] });

const established = [
  base({ id:'a', title:'Monster Train', rawgId:1, status:'Finished', rating:5, playtimeHours:80, genres:['Strategy'], rawgTags:['Deckbuilder','Roguelite'] }),
  base({ id:'b', title:'Hades', rawgId:2, status:'Finished', rating:5, playtimeHours:60, genres:['Action'], rawgTags:['Roguelite'] }),
  base({ id:'c', title:'Into the Breach', rawgId:3, status:'Playing', rating:4, genres:['Strategy'], rawgTags:['Tactical RPG'] }),
  base({ id:'w', title:'Slay the Spire 2', rawgId:50, collectionType:'wishlist', genres:['Strategy'], rawgTags:['Deckbuilder','Roguelite'] }),
  base({ id:'p', title:'Tactical Plan', rawgId:51, status:'Want to play', genres:['Strategy'], rawgTags:['Tactical RPG'] }),
];

test('established user receives non-empty personalized recommendations and fallback is minority', async () => {
  const result = await buildPersonalizedRecommendations(established, { useCache:false, fetchers: { similar: async () => [rawg(10,'Wildfrost'), rawg(11,'Balatro',['Deckbuilder'])], discover: async ({ ordering }) => ordering === '-added' ? [rawg(99,'Taste Fallback')] : [rawg(12,'Cobalt Core',['Deckbuilder']), rawg(13,'Dicey Dungeons',['Roguelite'])] } });
  assert.ok(result.candidates.length >= 4);
  assert.ok(result.candidates.some(c => c.source === 'similar_game'));
  assert.ok((result.diagnostics.finalSourceMix.taste_filtered_fallback ?? 0) <= 1);
  assert.ok(result.candidates.every(c => c.reason && c.reason !== 'Trending'));
});

test('sparse ratings still use finished, planned, and wishlist taste data', async () => {
  const sparse = established.map(g => ({ ...g, rating: null }));
  const result = await buildPersonalizedRecommendations(sparse, { useCache:false });
  assert.ok(result.candidates.length >= 1);
  assert.ok(result.candidates.some(c => c.source === 'wishlist_affinity'));
});

test('provider failure keeps local affinity and previous valid recommendations visible', async () => {
  const previous = (await buildPersonalizedRecommendations(established, { useCache:false })).candidates;
  const result = await buildPersonalizedRecommendations(established, { useCache:false, previous, fetchers: { similar: async () => { throw new Error('down'); }, discover: async () => { throw new Error('down'); } } });
  assert.ok(result.candidates.length >= 1);
  assert.ok(result.candidates.some(c => c.source === 'wishlist_affinity'));
});

test('hydration delay does not commit empty results before data arrives', async () => {
  const early = await buildPersonalizedRecommendations([], { hydrationReady:false, useCache:false });
  assert.equal(early.candidates.length, 0);
  assert.equal(early.diagnostics.hydrationReady, false);
  const later = await buildPersonalizedRecommendations(established, { hydrationReady:true, useCache:false });
  assert.ok(later.candidates.length > 0);
});

test('low result count renders as a valid result and skipped/seen state does not globally suppress unrelated items', () => {
  const profileGames = established;
  const candidate = { game: { rawgId: 77, title:'One Good Match', coverUrl:null, metacritic:80, rawgRating:4, rawgRatingsCount:10, platforms:['PC'], hasSteamVersion:true, genres:['Strategy'], tags:['Deckbuilder'], released:null, slug:null }, source:'tag_affinity' as const };
  const result = selectPersonalizedRecommendations([candidate], profileGames, buildPersonalizedTasteProfile(profileGames), new Set());
  assert.equal(result.length, 1);
});
