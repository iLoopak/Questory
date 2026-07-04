# QuestShelf SteamGridDB Artwork UX Audit

> Audit date: 2026-06-20  
> Branch: community-alpha-ux-quest-queue-language  
> Scope: all components that render game artwork  
> Constraint: no code changes — audit only

---

## 1 · Current Artwork Map

| Location | Component | File | Source Called | Import Source | Container Shape | Aspect | `object-fit` | Notes |
|---|---|---|---|---|---|---|---|---|
| Library / Wishlist card | `GameCard` | `components/GameCard.tsx` | `getPreferredArtworkSources(game,'portrait')` + `getGameCoverSources()` appended | **steamGridDbArtwork** | landscape header banner | `aspect-[16/9]` | `object-cover` | Portrait sources in 16:9 slot → crops or pillarboxes |
| Game Detail · cover | `GameDetailView` | `components/GameDetailView.tsx` | `getGameCoverSources(game)` | gameCoverImages | portrait slot | `aspect-[2/3]` | `object-contain` | Correct source, correct ratio |
| Game Detail · hero bg | `GameDetailView` | same | `game.heroImage ?? wideCoverImage ?? backgroundImage ?? coverImage` (inline) | direct field | full-bleed blur backdrop | absolute inset-0 | `object-cover` | Correct |
| Game Detail · logo | `GameDetailView` | same | `getPreferredLogoUrl(game)` | gameCoverImages | `max-h-12 max-w-[180px]` | unconstrained | `object-contain` | Only place logoImage is used in the entire app |
| Home · GamePosterButton | `GamePosterButton` | `components/HomePanel.tsx` | `getPreferredArtworkSources(game,'landscape')[0]` | gameCoverImages | min-h-56/72, full width | landscape | `object-cover` | Single source, no error fallback cycling |
| Home · Next Adventure card bg | `NextAdventureCard` | same | `getPreferredArtworkSources(game,'landscape')[0] ?? getGameCoverSources()[0]` | gameCoverImages | full-bleed | landscape | `object-cover opacity-15` | Single source, no cycling |
| Home · Wishlist Deal card | `WishlistDealCard` | same | `getPreferredArtworkSources(game,'landscape')` + `getGameCoverSources()` | gameCoverImages | `aspect-[3/4]` portrait | **3:4 portrait** | `object-cover` | ⚠️ Landscape sources in portrait slot |
| Home · Deal action sheet thumb | `WishlistDealActionSheet` | same | `getPreferredArtworkSources(game,'landscape')[0]` | gameCoverImages | `72×52px` | ~4:3 portrait | `object-cover` | ⚠️ Landscape source in portrait thumb |
| Playing Now · cover thumbnail | `PlayingNowCover` | `features/playing-now/PlayingNowHub.tsx` | `getPreferredArtworkSources(game,'landscape')` + `getGameCoverSources()` | **steamGridDbArtwork** | `h-24 w-16` (96×64px) | portrait 2:3 | `object-cover` | ⚠️ Landscape source in portrait thumb |
| Quest Queue · playing cover | `QueueCoverThumbnail` | `components/QueuePanel.tsx` | `getPreferredArtworkSources(game,'portrait')` + `getGameCoverSources()` | **steamGridDbArtwork** | `80×60px` | portrait ~4:3 | `object-cover` | Sources correct; simpler impl |
| Quest Queue · tiny cover | `QueueCoverThumbnail` | same | same | **steamGridDbArtwork** | `44×33px` | portrait ~4:3 | `object-cover` | OK at this size |
| Quest Queue · platform header | platform artwork | `components/QueuePanel.tsx` | `getPlatformArtworkUrl()` — not a game field | n/a | `h-16`, full width | landscape banner | `object-cover` | Platform art, not game art — unrelated |
| Review Mode · swipe card | `FocusedReviewCard` | `components/ReviewModePanel.tsx` | `getGameCoverSources(game)` | gameCoverImages | `qs-review-cover` class | `aspect-ratio:2/3` | `object-contain p-2` | Correct source, correct ratio |
| Artwork Picker · preview grid | `ArtworkCandidateCell` | `components/SteamGridDbArtworkPickerModal.tsx` | `candidate.url` direct | n/a | per-tab | 2/3 · 460/215 · 1920/620 · 1/1 | `object-cover` / `object-contain` | Correct per tab |

---

## 2 · Classification and Recommended Art Order

| Location | Type | Current | Recommended |
|---|---|---|---|
| GameCard (library/wishlist grid) | **LANDSCAPE** | portrait source in landscape slot | `wideCoverImage → heroImage → backgroundImage → coverImage` |
| Game Detail · main cover | **PORTRAIT** | ✅ portrait source, portrait slot | `coverImage → wideCoverImage → heroImage` |
| Game Detail · hero background | **BACKGROUND** | ✅ heroImage → wideCoverImage → backgroundImage → coverImage | keep |
| Game Detail · logo overlay | **LOGO** | ✅ logoImage only | `logoImage` (no fallback to other types) |
| Home · GamePosterButton | **LANDSCAPE** | ✅ landscape source | `wideCoverImage → heroImage → backgroundImage → coverImage` |
| Home · NextAdventure card bg | **BACKGROUND** | OK (opacity-15, forgiving) | `heroImage → wideCoverImage → backgroundImage → coverImage` |
| Home · WishlistDealCard | **PORTRAIT** | ⚠️ landscape source in portrait slot | `coverImage → wideCoverImage → heroImage` |
| Home · Deal action sheet thumb | **MICRO** | ⚠️ landscape source in portrait thumb | `coverImage → wideCoverImage → heroImage` |
| Playing Now · thumbnail | **PORTRAIT** | ⚠️ landscape source in portrait thumb | `coverImage → wideCoverImage → heroImage` |
| Quest Queue · covers (both sizes) | **PORTRAIT** | ✅ portrait source | `coverImage → wideCoverImage → heroImage` |
| Review Mode · swipe card | **PORTRAIT** | ✅ portrait source, correct slot | `coverImage → wideCoverImage → heroImage` |

---

## 3 · SteamGridDB Enhancement Opportunities

| Location | Asset | Expected UX Benefit |
|---|---|---|
| **Home GamePosterButton** | `logoImage` overlay above gradient | Title text replaced by transparent logo = polished Steam Deck / platform dashboard feel. High visual impact. |
| **Playing Now spotlight** | `heroImage` as full-bleed backdrop + `logoImage` overlay | Transforms a simple list item into a cinematic "now playing" card — hero art fills background, logo sits above, playtime below. |
| **Game Detail header** | `logoImage` already used | Already implemented but currently only rendered when `logoImage` exists; could add a soft loading placeholder. |
| **Quest Queue platform column** | `heroImage` / `wideCoverImage` as currently-playing game banner | Rich banner for the active game in each platform plan (similar to what was explored for PlayingNow). |
| **Review Mode swipe cards** | `heroImage` as ambient blurred background behind portrait cover | Depth effect while swiping — hero fills a slightly scaled backdrop, portrait cover floats in front. Minimal layout change. |
| **Next Adventure card** | `heroImage` instead of random `landscape[0]` | More dramatic "this is your next game" banner at full opacity with a gradient veil. |
| **Wishlist deal cards** | Switch to portrait source | Would correctly show the game box art instead of a cropped landscape header. |

---

## 4 · Bad Artwork Usage — Defects

### 🔴 Critical

| # | Issue | Location | Detail |
|---|---|---|---|
| C1 | **Source/shape mismatch** | `WishlistDealCard` | Container is `aspect-[3/4]` (portrait), source is `getPreferredArtworkSources('landscape')`. Landscape art (wideCoverImage 460×215) gets object-cover-cropped into a 3:4 portrait frame — severe distortion for most games. |
| C2 | **Source/shape mismatch** | `PlayingNowHub` `PlayingNowCover` | Container is `h-24 w-16` (portrait ~2:3), source is `getPreferredArtworkSources('landscape')` from `steamGridDbArtwork`. Landscape art heavily cropped in a portrait thumb. |

### 🟠 Major

| # | Issue | Location | Detail |
|---|---|---|---|
| M1 | **Source/shape mismatch** | `GameCard` (library/wishlist grid) | Header is `aspect-[16/9]`. Source is `getPreferredArtworkSources(game,'portrait')` from `steamGridDbArtwork`. Portrait covers (2:3) in a 16:9 slot — the source chain falls through to `wideCoverImage`/`heroImage` incidentally, not intentionally. |
| M2 | **Dual `getPreferredArtworkSources` implementations** | Global | `gameCoverImages.ts` and `steamGridDbArtwork.ts` both export a function with the same name but different logic. The gameCoverImages version appends the full Steam CDN fallback chain; the steamGridDbArtwork version returns only direct field values. GameCard, QueuePanel, PlayingNow use the simpler version, patching it with a `...getGameCoverSources()` concatenation at call sites. |
| M3 | **Landscape source in portrait thumb** | `WishlistDealActionSheet` | 72×52px thumb uses `getPreferredArtworkSources('landscape')[0]`. At that size the crop is less visible but still semantically wrong. |
| M4 | **No fallback cycling in HomePanel** | `GamePosterButton`, `NextAdventureCard`, `WishlistDealActionSheet` | All take only `[0]` from the source array. If that URL fails (404, rate-limit, CORS), the card shows nothing — no retry on error. |
| M5 | **`logoImage` + `iconImage` conflated** | `steamGridDbArtwork.ts` line 218 | `getPreferredArtworkSources(game,'logo')` falls back to `iconImage` then `coverImage`. Logo ≠ icon ≠ cover — a pixel icon or portrait cover used as a logo would look wrong wherever logos are rendered. |

### 🟡 Minor

| # | Issue | Location | Detail |
|---|---|---|---|
| m1 | **`object-contain` on portrait cover** | `GameDetailView` | Fine when art is portrait, but if only a landscape fallback is available the contain mode produces horizontal pillarboxing inside the slot. |
| m2 | **`backgroundImage` (RAWG) ordering** | `getArtworkCandidates` in `gameCoverImages.ts` | `backgroundImage` is pushed before `wideCoverImage`/`heroImage`. For any game with RAWG data, the RAWG landscape screenshot gets priority over SteamGridDB assets. SGDB assets should rank higher. |
| m3 | **`logoImage` unused outside Game Detail** | All non-detail components | The transparent logo is fetched via SGDB and stored, but rendered in exactly one place. High potential for hero cards, playing-now, and home posters. |

---

## 5 · Architecture

### Current state — three call patterns for the same intent

```ts
// Pattern A — gameCoverImages (full fallback chain incl. Steam CDN + generated SVG)
import { getPreferredArtworkSources } from '../lib/gameCoverImages';
getPreferredArtworkSources(game, 'landscape')

// Pattern B — steamGridDbArtwork (direct fields only, no Steam CDN, no generated SVG)
import { getPreferredArtworkSources } from '../lib/steamGridDbArtwork';
getPreferredArtworkSources(game, 'portrait')

// Pattern C — hybrid workaround (B appended with A's standard chain)
[...getPreferredArtworkSources(game, 'portrait'), ...getGameCoverSources(game)]
// used in: GameCard, PlayingNow, QueuePanel
```

### Recommended — single canonical helper in `gameCoverImages.ts`

Extend the existing `ArtworkUsage` type with two new values and consolidate all imports:

```ts
export type ArtworkUsage =
  | 'portrait'    // coverImage → wideCoverImage → heroImage → steam CDN → rawg → fallback-svg
  | 'landscape'   // wideCoverImage → heroImage → backgroundImage → coverImage → steam CDN → fallback-svg
  | 'hero'        // heroImage → wideCoverImage → backgroundImage → coverImage
  | 'logo'        // logoImage only (no cross-type fallback)
  | 'icon'        // iconImage only
  | 'background'  // heroImage → wideCoverImage → backgroundImage → coverImage (ambient backdrop)
  | 'micro'       // portrait priority, no generated-SVG fallback (unreadable at <50px)
```

`'background'` is semantically distinct from `'hero'`: same field order, different rendering context (one is focal, one is ambient). The distinction helps future readers understand intent without inspecting the container.

Delete `getPreferredArtworkSources` from `steamGridDbArtwork.ts` and update `GameCard`, `QueuePanel`, `PlayingNowHub` to import from `gameCoverImages`. TypeScript will catch any missed import sites.

---

## 6 · High-Impact Improvements (prioritized)

| Priority | Change | Effort | Visual Impact |
|---|---|---|---|
| 1 | Fix `WishlistDealCard` — switch to portrait source | Trivial | Eliminates severe landscape-in-portrait crop on Wishlist tab |
| 2 | Fix `PlayingNowHub` — switch to portrait source | Trivial | Correct art in the Playing Now thumbnail |
| 3 | Fix `GameCard` — decide intent (LANDSCAPE slot → use landscape source; or PORTRAIT slot → redesign) | Small | Clarifies card design intent and fixes source mismatch |
| 4 | Add `logoImage` overlay to `GamePosterButton` (Home) | Small | High visual quality lift — Steam Deck-style branding on hero cards |
| 5 | Merge to single `getPreferredArtworkSources` from `gameCoverImages` | Medium | Eliminates dual-implementation drift; unlocks wave 2 enhancements |
| 6 | Add `heroImage` as ambient backdrop in Review Mode swipe cards | Small | Depth and context without layout change |
| 7 | Add error-cycling to HomePanel single-source components | Small | Resilience — currently a 404 produces a blank card |

---

## Quick Wins

One-line or one-import changes with no design risk:

- `WishlistDealCard`: `'landscape'` → `'portrait'` in source call
- `PlayingNowHub`: `'landscape'` → `'portrait'` in source call
- `WishlistDealActionSheet` thumb: same one-line fix
- `GameCard`, `QueuePanel`, `PlayingNowHub`: update import from `steamGridDbArtwork` → `gameCoverImages`
- `steamGridDbArtwork.ts`: delete `getPreferredArtworkSources` export after imports updated
- `ArtworkUsage` type: add `'background'` and `'micro'` values (zero runtime cost)

---

## Potential Regressions to Avoid

| Risk | Mitigation |
|---|---|
| Deleting `getPreferredArtworkSources` from `steamGridDbArtwork.ts` breaks three files | Update imports first, then delete — TypeScript catches misses at compile time |
| Switching `WishlistDealCard` to portrait source may surface missing covers for SGDB-only games | Portrait chain already falls through to `wideCoverImage`/`heroImage` — acceptable degradation |
| Adding `logoImage` overlays where `logoImage` is blank | Use `getPreferredLogoUrl(game)` which already guards against empty/whitespace |
| `'micro'` usage skipping generated SVG: tiny slots currently show colored initials card | Verify design preference first; CSS letter fallback is an alternative |
| Reordering `backgroundImage` after `wideCoverImage`/`heroImage` in `getArtworkCandidates` | Changes what Review Mode and library grid show for games with both RAWG and SGDB data — audit per-field before moving |

---

## Implementation Waves

### Wave 1 — Source correctness (no design changes)

All trivial, zero design risk:

1. Fix `WishlistDealCard` → portrait source
2. Fix `PlayingNowHub` → portrait source
3. Fix `WishlistDealActionSheet` thumb → portrait source
4. Update `GameCard`, `QueuePanel`, `PlayingNowHub` imports → `gameCoverImages`
5. Delete `getPreferredArtworkSources` from `steamGridDbArtwork.ts`
6. Add `'background'` and `'micro'` to `ArtworkUsage` type

### Wave 2 — Logo and hero enhancements (additive only)

No existing UI broken; new artwork shown only when the field is populated:

1. `GamePosterButton` (Home): render `logoImage` overlay above the gradient
2. Playing Now spotlight: `heroImage` full-bleed + `logoImage` overlay
3. Review Mode swipe card: `heroImage` ambient backdrop behind portrait cover
4. `NextAdventureCard`: prefer `heroImage` for background

### Wave 3 — Layout and fallback quality (requires design review)

1. Decide `GameCard` final intent — LANDSCAPE (widescreen header) or PORTRAIT (book-cover grid) — pick one and commit
2. Add error-cycling to single-source HomePanel components (`GamePosterButton`, `NextAdventureCard`)
3. Reorder `backgroundImage` in `getArtworkCandidates` — move after `wideCoverImage`/`heroImage`
4. Implement `'micro'` usage: suppress generated-SVG fallback in sub-50px thumbnail slots
