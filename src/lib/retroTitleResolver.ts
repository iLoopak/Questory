export type RetroTitleResolveInput = {
  romFileName?: string | null;
  romPath?: string | null;
  currentTitle: string;
  metadataSearchTitle?: string | null;
};

export type RetroTitleResolveResult = {
  /** Best structural display form after noise removal, for informational/debug use */
  cleanedTitle: string;
  /** Ordered list of candidate search titles for RAWG/SteamGridDB, best-first */
  candidateTitles: string[];
  /** Debug notes about normalization steps */
  notes: string[];
};

/**
 * Known cases where ROM sets abbreviate a franchise name in the primary title slot.
 * Key = lowercased abbreviated name, value = lowercased full franchise name.
 */
const FRANCHISE_EXPANSIONS: Readonly<Record<string, string>> = {
  zelda: 'legend of zelda',
};

/** APA-style: these words are lowercase when not the first word of a title */
const TITLE_CASE_LOWERCASE = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor',
  'on', 'at', 'to', 'by', 'of', 'in', 'up', 'as', 'is', 'if',
]);

export function resolveRetroTitle(input: RetroTitleResolveInput): RetroTitleResolveResult {
  const rawPath = input.romFileName ?? input.romPath ?? '';
  const baseName = getBaseName(rawPath);

  if (!baseName) {
    const candidates: string[] = [];
    const userTitle = input.metadataSearchTitle?.trim() ?? null;
    if (userTitle) candidates.push(userTitle);
    if (!candidates.includes(input.currentTitle)) candidates.push(input.currentTitle);
    return { cleanedTitle: input.currentTitle, candidateTitles: candidates, notes: ['No ROM filename available'] };
  }

  const notes: string[] = [`filename: ${baseName}`];

  // 1. Strip noise tags (region, revision, dump, disc) while preserving `, ` and ` - ` structure
  const stripped = stripNoiseTags(baseName);
  notes.push(`stripped: ${stripped}`);

  if (!stripped) {
    const candidates: string[] = [];
    const userTitle = input.metadataSearchTitle?.trim() ?? null;
    if (userTitle) candidates.push(userTitle);
    if (!candidates.includes(input.currentTitle)) candidates.push(input.currentTitle);
    return { cleanedTitle: input.currentTitle, candidateTitles: candidates, notes };
  }

  // 2. Detect structural pattern
  const structure = parseStructure(stripped);
  notes.push(`pattern: ${structure.type}`);

  // 3. Build ordered candidates
  const rawCandidates: string[] = [];

  // User-set metadataSearchTitle always goes first — never second-guess it
  const userTitle = input.metadataSearchTitle?.trim() ?? null;
  if (userTitle) rawCandidates.push(userTitle);

  let cleanedTitle = '';

  switch (structure.type) {
    case 'reorder': {
      const { main, moved, subtitle } = structure;
      const reorderedBase = `${moved} ${main}`;
      cleanedTitle = subtitle ? `${reorderedBase}: ${subtitle}` : reorderedBase;

      // Franchise expansion: "Zelda" → "Legend of Zelda" → "The Legend of Zelda"
      const expandedBase = expandFranchise(moved, main);
      if (expandedBase) {
        notes.push(`franchise expansion: ${expandedBase}`);
        rawCandidates.push(subtitle ? `${expandedBase}: ${subtitle}` : expandedBase);
      }

      // Reordered with colon subtitle separator
      if (subtitle) rawCandidates.push(`${reorderedBase}: ${subtitle}`);

      // Reordered joined (no colon)
      rawCandidates.push(subtitle ? `${reorderedBase} ${subtitle}` : reorderedBase);

      // Original ordering: main + subtitle (without the moved article/adjective)
      if (subtitle) rawCandidates.push(`${main} ${subtitle}`);

      // Main alone as broad fallback
      rawCandidates.push(main);
      break;
    }

    case 'subtitle': {
      const { title, subtitle } = structure;
      cleanedTitle = `${title}: ${subtitle}`;

      // Subtitle with trailing "Version"/"Edition" stripped (e.g. "FireRed Version" → "FireRed")
      const shortSubtitle = stripVersionSuffix(subtitle);
      if (shortSubtitle) rawCandidates.push(`${title} ${shortSubtitle}`);

      // Joined (no separator)
      rawCandidates.push(`${title} ${subtitle}`);

      // With colon
      rawCandidates.push(`${title}: ${subtitle}`);

      // Title alone as broad fallback
      rawCandidates.push(title);
      break;
    }

    default: {
      cleanedTitle = structure.title;
      rawCandidates.push(structure.title);
      break;
    }
  }

  return {
    cleanedTitle: cleanedTitle || input.currentTitle,
    candidateTitles: deduplicate(rawCandidates).filter(Boolean),
    notes,
  };
}

// ---- internal helpers ----

function getBaseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = normalized.split('/').filter(Boolean).pop() ?? filePath;
  return stripExtension(fileName.trim());
}

function stripExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

function stripNoiseTags(baseName: string): string {
  return baseName
    // Region tags: (USA), (Europe), (Japan), (World), (En), (En,Fr,De), etc.
    .replace(/\(\s*(?:usa?|europe?|eur|japan|jap|jpn|world|korea|kor|france|germany|deutschland|italy|spain|australia|brazil|china|taiwan|netherlands|portugal|sweden|norway|denmark|finland|russia|poland|scandinavia|en|fr|de|es|it|jp|ko|zh|nl|pt|sv|no|da|fi|ru|pl)\b[^)]*\)/gi, ' ')
    // Revision/version tags: (Rev 1), (Rev A), (v1.0), (Beta), (Demo), (Prototype)
    .replace(/\(\s*(?:rev(?:ision)?\s*\w+|v\d+(?:\.\d+)*|beta(?:\s+\d+)?|demo|prototype|sample|promo|unlicensed|pirate)\s*\)/gi, ' ')
    // Disc/CD tags: (Disc 1), (Disk 2 of 3), (CD1)
    .replace(/\(\s*(?:disc|disk|cd)\s*\d+(?:\s*of\s*\d+)?\s*\)/gi, ' ')
    // Dump/verification tags: [!], [a], [b], [h], [T+Eng], [No-Intro], [GoodTools], etc.
    .replace(/\[[^\]]*\]/g, ' ')
    // Underscores → spaces
    .replace(/_+/g, ' ')
    // Collapse whitespace
    .replace(/\s{2,}/g, ' ')
    // Trailing punctuation/whitespace
    .replace(/[\s,;]+$/, '')
    .trim();
}

type StructurePlain = { type: 'plain'; title: string };
type StructureSubtitle = { type: 'subtitle'; title: string; subtitle: string };
type StructureReorder = { type: 'reorder'; main: string; moved: string; subtitle: string | null };
type RomTitleStructure = StructurePlain | StructureSubtitle | StructureReorder;

function parseStructure(stripped: string): RomTitleStructure {
  // Comma-reorder pattern: "Main, Moved - Subtitle" or "Main, Moved"
  // ROM naming convention: "Title, Article" = article was moved to end
  // e.g. "Legend of Zelda, The - The Minish Cap" → main="Legend of Zelda" moved="The" subtitle="The Minish Cap"
  const commaMatch = stripped.match(/^(.+?),\s+(.+?)(?:\s+-\s+(.+))?$/);
  if (commaMatch) {
    return {
      type: 'reorder',
      main: commaMatch[1].trim(),
      moved: commaMatch[2].trim(),
      subtitle: commaMatch[3]?.trim() ?? null,
    };
  }

  // Subtitle separator: "Title - Subtitle" (space-dash-space = ROM subtitle convention)
  const subtitleMatch = stripped.match(/^(.+?)\s+-\s+(.+)$/);
  if (subtitleMatch) {
    return {
      type: 'subtitle',
      title: subtitleMatch[1].trim(),
      subtitle: subtitleMatch[2].trim(),
    };
  }

  return { type: 'plain', title: stripped };
}

function expandFranchise(moved: string, main: string): string | null {
  const key = main.toLowerCase().trim();
  const expanded = FRANCHISE_EXPANSIONS[key];
  if (!expanded) return null;
  return `${moved} ${toTitleCase(expanded)}`;
}

function stripVersionSuffix(subtitle: string): string | null {
  const stripped = subtitle.replace(/\s+(?:version|edition)$/i, '').trim();
  return stripped.length > 0 && stripped !== subtitle ? stripped : null;
}

function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word, i) => (i === 0 || !TITLE_CASE_LOWERCASE.has(word)) ? word.charAt(0).toUpperCase() + word.slice(1) : word)
    .join(' ');
}

function deduplicate(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}
