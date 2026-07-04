# QuestShelf Typography & Text Hierarchy Audit

## A. Findings Report

---

### CRITICAL

**C-1 — No typography scale defined in `tailwind.config.js`**
The app uses zero custom font-size tokens. Every non-standard size is written as an arbitrary Tailwind value inline at point of use. There are **13 unique arbitrary font sizes** scattered across the codebase with no central definition. This means the same visual size is spelled differently in different files, silently diverges over time, and cannot be changed in one place.

Affected everywhere. Root cause of most other findings.

**C-2 — Sub-10px text in production UI**
`text-[9px]` and `text-[9.5px]` are used in ReviewModePanel for zone action labels. At 9px, text is below the WCAG minimum readable size guideline (14px), is completely unreadable on a Retroid at arm's length, and will render illegibly on any screen with physical DPI > 2×. On 1080p handheld displays (the primary target), this is effectively invisible.

Affected: `ReviewModePanel.tsx` (zone labels, action description hints, swipe tip).

**C-3 — 13 arbitrary sub-`text-xs` sizes create visual noise**
The range `text-[0.55rem]` → `text-[0.68rem]` contains six distinct values doing similar work (micro-labels, badges, kickers). A reader perceives them as visually identical. The variance serves no hierarchy purpose and makes maintenance impossible.

Values: `0.55rem`, `0.6rem`, `0.62rem`, `0.65rem`, `0.68rem`, `0.72rem` — all essentially "tiny label" intent.

---

### HIGH

**H-1 — `font-semibold` monoculture**
517 of 651 font-weight instances are `font-semibold`. This collapses the weight axis of the hierarchy: titles, body text, labels, and captions all read at the same visual weight. The eye has no weight gradient to scan. `font-bold` appears only 52 times, `font-medium` 86 times, lighter weights essentially never.

Consequence: in card-dense views (Library, Quest Queue), everything competes for equal attention.

**H-2 — 7 letter-spacing values with no semantic meaning**
`tracking-[0.08em]` through `tracking-[0.2em]` are used interchangeably on similar elements across different components. There is no documented rule for when to use which. The most common (`tracking-[0.14em]`, 104 instances) and second (`tracking-[0.12em]`, 33 instances) are perceptually indistinguishable in most contexts.

**H-3 — Inconsistent truncation strategies**
`truncate` (61 uses), `line-clamp-2` (9 uses), `line-clamp-1` (2 uses), CSS `-webkit-line-clamp` (2 uses), and unwrapped text with container `overflow-hidden` all coexist. Game titles in some cards get `line-clamp-2`, in others `truncate`. Long Czech strings will cause layout breaks in any component using `truncate` without a `min-w-0` guard on the flex parent.

**H-4 — No defined text color semantic layer**
`text-white`, `text-slate-100/200/300/400/500/600`, and `text-mint` are used interchangeably for "primary", "secondary", and "muted" roles. `text-slate-400` and `text-slate-500` are used for both muted metadata and important secondary labels. There is no token like `--text-primary / --text-secondary / --text-muted` applied consistently.

Note: the CSS file defines `var(--text-muted)` and `var(--text-secondary)` for a few `.qs-*` components but these are not wired into Tailwind utilities.

**H-5 — `text-[0.9375rem]` and `text-[0.95rem]` — magic values for primary UI**
The Home panel CTA button uses `text-[0.9375rem]` (effectively 15px) and toast message text uses `text-[0.95rem]`. These are the two highest-visibility text elements in the app and they use hardcoded arbitrary sizes with no relation to any scale.

---

### MEDIUM

**M-1 — `text-sm` and `text-base` overlap in card titles**
Game cards use `text-base sm:text-lg`, which jumps from 16px to 18px. On mobile this is fine. On the Retroid landscape viewport the card grid compresses and `text-base` titles at ~14–16px become tight in a 2–3 column layout. No intermediate breakpoint exists for the 760px–1024px handheld range.

**M-2 — Heading scale is shallow**
The largest standard heading found is `text-3xl` (8 instances) and `text-4xl` (2 instances). Most section headers use `text-xl` or `text-lg`. The jump from section header (`text-lg` / 18px) to card title (`text-base` / 16px) is only 2px — insufficient hierarchy for controller-first scanning.

**M-3 — Uppercase abuse on metadata**
`uppercase` + `tracking-[0.14em]` is applied to platform names, status labels, section dividers, kicker labels, action eyebrows, and stat names — approximately 100+ instances. Uppercase is effective at 1–2 hierarchy levels; applied everywhere, it loses its differentiation value. On small screens, uppercase spaced-out text at 10–11px is difficult to read quickly.

**M-4 — Line height not set on dense body text**
Most multi-line body text (game notes, descriptions, onboarding steps, recommendation reasoning) uses Tailwind's default `leading` which inherits from `line-height: 1.5`. But several description blocks have `leading-5` (20px) applied at `text-sm` (14px), giving an adequate 1.43 ratio. Some blocks have no leading class set at all and rely on the global default. These should be explicit.

**M-5 — `font-mono` used inconsistently**
`font-mono` appears 7 times: Quest Runner canvas text, some stat numbers, and the controller debug panel. Using monospace for stat numbers is good practice (tabular alignment). But it's applied ad-hoc rather than as a semantic `tabular-nums` utility + consistent font choice.

**M-6 — `text-[10px]` used for important labels in HomePanel**
Section labels in Home (`text-[10px]` font-semibold text-slate-500) and progress badge (`text-[9px]` font-bold) are the first things a user sees. At 9–10px on a 5.5" Retroid screen held at 50cm, these become a strain to read. The label hierarchy should floor at 11px (0.688rem, approximately `text-xs` = 12px).

**M-7 — Daily Quest card uses `text-xs` for all text**
`DailyQuestCard.tsx` uses `text-xs` for title, hint text, and play button label. No size differentiation between the card's hierarchy levels. The title and the hint text are visually identical weight/size.

---

### LOW

**L-1 — `leading-6` overuse**
46 instances of `leading-6` (24px line height). At `text-sm` (14px), `leading-6` gives a 1.71 ratio — generous but fine. At `text-xs` (12px), `leading-6` gives a 2.0 ratio — wasteful of vertical space on dense handheld screens.

**L-2 — Mixed em/px in letter-spacing across CSS and Tailwind**
CSS classes use `letter-spacing: 0.14em` while Tailwind classes use `tracking-[0.14em]`. These resolve identically, but mixing the two authoring surfaces makes it harder to audit.

**L-3 — `.qs-review-future-zone-label` uses `font-weight: 900`**
Inter at weight 900 (Black) renders very heavy and slightly distorted at small display sizes. This should be 800 or 700 for cleaner rendering on sub-OLED handheld screens.

**L-4 — `text-[11px]` in AppearanceSettingsPanel is an orphan**
Single use with no peer elements nearby using the same size. Likely crept in during iteration.

---

## B. Screens Requiring Attention

| Screen / Component | Issues |
|---|---|
| **ReviewModePanel** | C-2, H-3, M-3 — 9px text, inconsistent label approach, uppercase saturation |
| **HomePanel** | C-3, M-6, H-5 — sub-10px labels, magic px CTA size |
| **GameCard (Library/Wishlist)** | H-1, H-3, M-1 — weight monoculture, truncation inconsistency |
| **PlayingNowHub** | M-3, H-1 — uppercase everywhere, no weight gradient |
| **DailyQuestCard** | M-7 — flat hierarchy, all `text-xs` |
| **StatsPanel** | H-4, M-3 — color semantic drift, uppercase overuse |
| **Navigation (top/more menu)** | H-4, M-3 — unclear active state weight differentiation |
| **QuestRunnerGame** | C-2 — canvas 9px text for overlay hints |
| **Settings panels** | L-4, M-4 — orphan sizes, no explicit leading |
| **Onboarding / modal forms** | M-4, H-3 — line height not explicit, truncation inconsistencies |
| **Toast / notification stack** | H-5 — magic `0.95rem` for highest-visibility text |
| **Recommendation cards** | H-1, M-1 — same weight throughout, card hierarchy missing |

---

## C. Proposed Typography Scale

### Design token layer (CSS variables)

Define once in `src/styles.css` under `:root`:

```css
:root {
  /* ── Font size scale ──────────────────────────────────── */
  --font-2xs:   0.625rem;   /* 10px — absolute minimum, badges only */
  --font-xs:    0.75rem;    /* 12px — captions, metadata, micro-labels */
  --font-sm:    0.875rem;   /* 14px — secondary text, descriptions */
  --font-base:  1rem;       /* 16px — primary body / card titles */
  --font-md:    1.0625rem;  /* 17px — slightly larger body, CTAs */
  --font-lg:    1.125rem;   /* 18px — card titles on larger viewports */
  --font-xl:    1.25rem;    /* 20px — section headings */
  --font-2xl:   1.5rem;     /* 24px — page headings */
  --font-3xl:   1.875rem;   /* 30px — hero headings */

  /* ── Font weight scale ────────────────────────────────── */
  --weight-normal:    400;
  --weight-medium:    500;
  --weight-semibold:  600;
  --weight-bold:      700;
  --weight-extrabold: 800;

  /* ── Letter spacing ───────────────────────────────────── */
  --tracking-tight:  -0.01em;
  --tracking-normal:  0em;
  --tracking-label:   0.08em;   /* subtle label spacing */
  --tracking-caps:    0.12em;   /* uppercase micro-labels */
  --tracking-wide:    0.16em;   /* section dividers, kickers */

  /* ── Line height ──────────────────────────────────────── */
  --leading-tight:  1.2;
  --leading-snug:   1.35;
  --leading-base:   1.5;
  --leading-loose:  1.7;

  /* ── Semantic text colors (map to existing vars) ───────── */
  --text-primary:    var(--ink-50);    /* text-white equivalent */
  --text-secondary:  var(--slate-300); /* prominent metadata */
  --text-muted:      var(--slate-500); /* helper text, labels */
  --text-disabled:   var(--slate-600); /* inactive, placeholder */
  --text-accent:     var(--mint);      /* calls to action, highlights */
}
```

### Tailwind config extension

In `tailwind.config.js`, extend `fontSize` and `fontWeight` to map to these tokens:

```js
theme: {
  extend: {
    fontSize: {
      '2xs': ['var(--font-2xs)', { lineHeight: '1.2' }],
      // existing xs/sm/base/lg/xl/2xl/3xl map to token values
    },
    letterSpacing: {
      label: 'var(--tracking-label)',
      caps:  'var(--tracking-caps)',
      wide:  'var(--tracking-wide)',
    },
  },
}
```

### Semantic usage guide

| Role | Size | Weight | Tracking | Color token |
|---|---|---|---|---|
| Page / hero title | `text-2xl`–`text-3xl` | `font-semibold` | default | `--text-primary` |
| Section heading | `text-xl` | `font-semibold` | default | `--text-primary` |
| Card title | `text-base`–`text-lg` | `font-semibold` | default | `--text-primary` |
| Primary body | `text-sm`–`text-base` | `font-normal`/`font-medium` | default | `--text-primary` |
| Secondary body | `text-sm` | `font-normal` | default | `--text-secondary` |
| Metadata / helper | `text-xs` | `font-medium` | default | `--text-muted` |
| Micro-label / kicker | `text-xs` | `font-semibold` | `tracking-caps` | `--text-muted` |
| Badge / chip | `text-xs` | `font-semibold` | `tracking-label` | contextual |
| Caption / legal | `text-2xs` | `font-medium` | default | `--text-muted` |
| CTA button | `text-sm`–`text-base` | `font-semibold` | default | contextual |
| Stat numbers | `text-base`+ | `font-semibold` + `tabular-nums` | `tracking-tight` | `--text-accent` |

### Minimum sizes by context

| Context | Floor | Rationale |
|---|---|---|
| Body / primary | `text-sm` (14px) | WCAG AA comfortable reading |
| Metadata / secondary | `text-xs` (12px) | Minimum for handheld at 50cm |
| Labels / kickers | `text-xs` (12px) | Replace all sub-12px arbitrary values |
| Badge text | `text-2xs` (10px) | Absolute floor, badges only, never body |
| Controller-navigable items | `text-sm` (14px) | Thumb-distance readability |

---

## D. Quick Wins

These can be implemented immediately, file by file, with zero design risk.

**QW-1 — Fix 9px text in ReviewModePanel** *(C-2)*
Replace `text-[9px]` and `text-[9.5px]` with `text-[10px]` or `text-xs`. The visual change is 1–3px; the readability gain on handhelds is significant. Do the same in `QuestRunnerGame.tsx` canvas overlay text (bump minimum canvas font from 8–9px to 11px).

**QW-2 — Replace `text-[0.9375rem]` and `text-[0.95rem]` with `text-sm` or `text-base`** *(H-5)*
Home CTA button: `text-[0.9375rem]` → `text-base` (virtually identical rendered size, now on-scale).
Toast message: `text-[0.95rem]` → `text-sm` (14px vs 15.2px, imperceptible).

**QW-3 — Consolidate sub-`text-xs` arbitrary sizes to two values** *(C-3)*
Replace `0.55rem`, `0.6rem`, `0.62rem`, `0.65rem` → all `text-xs` (12px).
Replace `0.68rem`, `0.72rem` → `text-xs` or introduce `text-2xs` once in config.
This removes 6 arbitrary values.

**QW-4 — Add `min-w-0` to all flex parents containing `truncate` text** *(H-3)*
Any flex container where a child uses `truncate` needs `min-w-0` on the direct parent to prevent text from overflowing the flex row. This is a common gotcha that causes Czech strings to break layouts. Search `truncate` across all components and audit parent containers.

**QW-5 — Add `tabular-nums` to stat/score numbers** *(M-5)*
Any number that changes (playtime, score, count) should have `tabular-nums` to prevent layout jitter. Affects StatsPanel, QuestRunnerGame score display, PlayingNowHub playtime, Library item counts.

**QW-6 — DailyQuestCard: differentiate title from body** *(M-7)*
Title: promote to `text-sm font-semibold`.
Hint body: keep `text-xs font-normal`.
Two size levels make the card scannable without any visual redesign.

**QW-7 — Reduce letter-spacing variants from 7 to 3** *(H-2)*
In one pass across the codebase: replace all `tracking-[0.08em]` and `tracking-[0.1em]` → `tracking-label` (once defined in config); replace `tracking-[0.12em]` and `tracking-[0.14em]` → `tracking-caps`; replace `tracking-[0.16em]`, `tracking-[0.18em]`, `tracking-[0.2em]` → `tracking-wide`. This removes 4 arbitrary values.

---

## E. Refactor Opportunities

These are larger improvements that reduce ongoing maintenance cost. Do not implement automatically — each is a conscious architectural decision.

**R-1 — Define the typography scale in `tailwind.config.js`** *(addresses C-1)*
Map `text-2xs` → 10px, and wire the existing `xs`–`3xl` values to the CSS variable tokens. After this, every font-size change is a config edit. Estimated scope: `tailwind.config.js` + one pass to rename arbitrary values. ~1–2 hours.

**R-2 — Wire `--text-primary/secondary/muted/accent` to Tailwind utilities** *(addresses H-4)*
Add to `tailwind.config.js`:
```js
colors: {
  'text-primary': 'var(--text-primary)',
  'text-secondary': 'var(--text-secondary)',
  'text-muted': 'var(--text-muted)',
}
```
Then replace `text-white` (narrative body), `text-slate-300/400/500` (metadata) with semantic tokens in a single search-replace pass. This makes dark/light theme switching trivial and eliminates color-value hunting in audits. Scope: ~2–3 hours.

**R-3 — Create a `<Text>` or `<Label>` utility component for typed hierarchy** *(addresses H-1, M-3)*
A thin wrapper that enforces the hierarchy:
```tsx
<Text variant="section-heading">Platform Plans</Text>
<Text variant="metadata">14h played</Text>
<Text variant="kicker">Playing Now</Text>
```
Each variant maps to a fixed combination of size + weight + tracking + color token. Stops arbitrary inline composition and prevents hierarchy drift. Scope: ~3–4 hours to build; migration is gradual (add where refactoring anyway).

**R-4 — Standardize uppercase label pattern into one CSS class** *(addresses M-3)*
The pattern `text-xs font-semibold uppercase tracking-[0.14em] text-slate-500` appears in dozens of components. Define `.qs-label-caps` in `styles.css` once and replace inline compositions. This also makes it trivial to change the global label appearance. Scope: ~1 hour.

**R-5 — Audit and align `.qs-*` CSS classes with Tailwind tokens** *(addresses L-2)*
The custom CSS classes (`qs-review-future-zone-label`, `qs-game-action-title`, etc.) hardcode their own font sizes and weights outside the Tailwind system. After the scale is defined in config, these classes should reference the CSS variables rather than hardcoded values. Scope: ~1 hour for existing classes; prevents future drift.

**R-6 — Introduce a responsive typography clamp mixin** *(addresses M-1)*
The current `clamp()` usage in `.qs-review-swipe-label` and `.qs-review-future-zone-label` is good. Extend this pattern to primary headings across breakpoints using a shared mixin or utility class, so heading sizes scale fluidly between 390px mobile and 1920px desktop without a `sm:` breakpoint jump. Particularly valuable for the Playing Now hero heading and section titles.

**R-7 — Line height audit pass** *(addresses L-1, M-4)*
After the scale is defined, do a single file-by-file pass: remove `leading-6` from `text-xs` elements (use `leading-5` or `leading-4` instead), ensure all multi-line body text has an explicit `leading-snug` or `leading-relaxed`. This removes ~20–30 instances of inappropriate line height.

---

## Summary by Priority

| # | Finding | Effort | Impact |
|---|---|---|---|
| C-1 | No typography scale | Medium | Critical |
| C-2 | Sub-10px text | Trivial | Critical |
| QW-2/3 | Magic values → scale | Trivial | High |
| QW-4 | `min-w-0` truncation guards | Trivial | High |
| QW-7 | Collapse tracking variants | Low | Medium |
| R-1 | Config scale definition | Low | Critical unlock |
| R-2 | Semantic color tokens | Medium | High |
| R-4 | `.qs-label-caps` class | Low | Medium |
| R-3 | `<Text>` component | Medium | Long-term |
