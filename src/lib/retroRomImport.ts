import type { Game, GamePlatform, RomFileReference } from '../types/game';

export const autoDetectPlatformOption = 'Auto-detect';

export const retroImportPlatforms = [
  'PSP',
  'PS2',
  'PS1',
  'PS Vita',
  'Dreamcast',
  'Switch',
  'Game Boy',
  'Game Boy Color',
  'Game Boy Advance',
  'NES',
  'SNES',
  'Nintendo 64',
  'Nintendo DS',
  'Wii',
  'Wii U',
  'GameCube',
  'Sega Genesis / Mega Drive',
  'Master System',
  'Game Gear',
  'PC Engine',
  'Other',
] as const;

export type RetroImportPlatform = (typeof retroImportPlatforms)[number];
export type RetroPlatformOverride = typeof autoDetectPlatformOption | RetroImportPlatform;

export type ScannableRomFile = Pick<File, 'name'> & {
  path?: string;
  uri?: string;
  webkitRelativePath?: string;
};

export type DetectedRom = {
  duplicateReason: string | null;
  extension: string;
  fileName: string;
  fileUri: string | null;
  id: string;
  isDuplicate: boolean;
  platform: GamePlatform;
  sourcePath: string;
  title: string;
  normalizedTitle: string;
  romFiles: RomFileReference[];
  fileCount: number;
  discCount: number;
};

export type RetroScanSummary = {
  detectedGames: number;
  scanIssues: RetroScanIssue[];
  scannedFiles: number;
  unsupportedFiles: number;
};

export type RetroScanIssue = {
  fileName: string;
  reason: string;
  type: 'duplicate' | 'empty-title' | 'unsupported-format';
};

type RomScanEntry = {
  extension: string;
  file: ScannableRomFile;
  fileName: string;
  fileUri: string | null;
  index: number;
  normalizedTitle: string;
  parentFolder: string;
  platform: GamePlatform;
  sourcePath: string;
  title: string;
};

type RomGroup = {
  entries: RomScanEntry[];
  key: string;
  normalizedTitle: string;
  platform: GamePlatform;
  title: string;
};

const supportedRomExtensions = new Set([
  'iso',
  'chd',
  'cso',
  'cue',
  'gdi',
  'bin',
  'raw',
  'rvz',
  'wua',
  'wux',
  'wad',
  'gba',
  'gbc',
  'gb',
  'nes',
  'sfc',
  'smc',
  'n64',
  'z64',
  'v64',
  'nds',
  'md',
  'gen',
  'sms',
  'gg',
  'pce',
  'pbp',
  'vpk',
  'xci',
  'nsp',
  'wbfs',
  'gcm',
]);

const descriptorExtensions = new Set(['cue', 'gdi']);
const descriptorCompanionExtensions = new Set(['bin', 'raw']);

const extensionPlatformMap = new Map<string, GamePlatform>([
  ['cso', 'PSP'],
  ['gba', 'Game Boy Advance'],
  ['gbc', 'Game Boy Color'],
  ['gb', 'Game Boy'],
  ['nes', 'NES'],
  ['sfc', 'SNES'],
  ['smc', 'SNES'],
  ['n64', 'Nintendo 64'],
  ['z64', 'Nintendo 64'],
  ['v64', 'Nintendo 64'],
  ['nds', 'Nintendo DS'],
  ['md', 'Sega Genesis / Mega Drive'],
  ['gen', 'Sega Genesis / Mega Drive'],
  ['sms', 'Master System'],
  ['gg', 'Game Gear'],
  ['pce', 'PC Engine'],
  ['pbp', 'PS1'],
  ['vpk', 'PS Vita'],
  ['xci', 'Switch'],
  ['nsp', 'Switch'],
  ['wbfs', 'Wii'],
  ['gcm', 'GameCube'],
  ['rvz', 'GameCube'],
  ['wua', 'Wii U'],
  ['wux', 'Wii U'],
  ['wad', 'Wii'],
  ['gdi', 'Dreamcast'],
]);

const folderPlatformHints: Array<[RegExp, GamePlatform]> = [
  [/(^|[^a-z0-9])psp([^a-z0-9]|$)/, 'PSP'],
  [/(^|[^a-z0-9])ps2([^a-z0-9]|$)/, 'PS2'],
  [/(^|[^a-z0-9])ps1([^a-z0-9]|$)/, 'PS1'],
  [/(^|[^a-z0-9])(vita|psvita)([^a-z0-9]|$)/, 'PS Vita'],
  [/(^|[^a-z0-9])(dreamcast|dc)([^a-z0-9]|$)/, 'Dreamcast'],
  [/(^|[^a-z0-9])switch([^a-z0-9]|$)/, 'Switch'],
  [/(^|[^a-z0-9])gba([^a-z0-9]|$)/, 'Game Boy Advance'],
  [/(^|[^a-z0-9])gbc([^a-z0-9]|$)/, 'Game Boy Color'],
  [/(^|[^a-z0-9])gb([^a-z0-9]|$)/, 'Game Boy'],
  [/(^|[^a-z0-9])snes([^a-z0-9]|$)/, 'SNES'],
  [/(^|[^a-z0-9])nes([^a-z0-9]|$)/, 'NES'],
  [/(^|[^a-z0-9])n64([^a-z0-9]|$)/, 'Nintendo 64'],
  [/(^|[^a-z0-9])nds([^a-z0-9]|$)/, 'Nintendo DS'],
  [/(^|[^a-z0-9])wiiu([^a-z0-9]|$)/, 'Wii U'],
  [/(^|[^a-z0-9])wii\s*u([^a-z0-9]|$)/, 'Wii U'],
  [/(^|[^a-z0-9])wii([^a-z0-9]|$)/, 'Wii'],
  [/(^|[^a-z0-9])(gamecube|gc)([^a-z0-9]|$)/, 'GameCube'],
  [/(^|[^a-z0-9])(genesis|megadrive)([^a-z0-9]|$)/, 'Sega Genesis / Mega Drive'],
  [/(^|[^a-z0-9])sms([^a-z0-9]|$)/, 'Master System'],
  [/(^|[^a-z0-9])gamegear([^a-z0-9]|$)/, 'Game Gear'],
];

export function scanRomFiles(
  files: ScannableRomFile[],
  existingGames: Game[],
  platformOverride: RetroPlatformOverride,
): { detectedRoms: DetectedRom[]; summary: RetroScanSummary } {
  const scanIssues: RetroScanIssue[] = [];
  const detectedKeys = new Set<string>();
  let unsupportedFiles = 0;

  const entries = files.flatMap((file, index): RomScanEntry[] => {
    const sourcePath = getFileSourcePath(file);
    const fileName = file.name || getFileNameFromPath(sourcePath) || `File ${index + 1}`;
    const fileUri = getFileUri(file);
    const extension = getFileExtension(fileName || sourcePath);

    if (!supportedRomExtensions.has(extension)) {
      unsupportedFiles += 1;
      scanIssues.push({
        fileName,
        reason: extension ? `.${extension} is not a supported ROM format yet.` : 'No file extension was found.',
        type: 'unsupported-format',
      });
      return [];
    }

    const normalizedTitle = normalizeRomFilename(fileName || sourcePath);
    const title = cleanupRomTitle(fileName || sourcePath);
    const isTrackOnlyDescriptorCompanion = descriptorCompanionExtensions.has(extension) && isDescriptorTrackFile(fileName);
    if ((!normalizedTitle && !isTrackOnlyDescriptorCompanion) || !title) {
      scanIssues.push({
        fileName,
        reason: 'QuestShelf could not create a readable game title from this file name.',
        type: 'empty-title',
      });
      return [];
    }

    const platform = platformOverride === autoDetectPlatformOption ? inferPlatform(sourcePath, extension) : (platformOverride as GamePlatform);

    return [
      {
        extension,
        file,
        fileName,
        fileUri,
        index,
        normalizedTitle,
        parentFolder: getParentFolder(sourcePath),
        platform,
        sourcePath,
        title,
      },
    ];
  });

  const detectedRoms = groupRomEntries(entries).map((group, groupIndex) => {
    const primaryEntry = getPreferredPrimaryEntry(group.entries);
    const romFiles = group.entries.map(entryToRomFile);
    const discCount = countGroupedDiscs(group.entries);
    const duplicateKey = getRomDuplicateKey({
      extension: primaryEntry.extension,
      platform: group.platform,
      sourcePath: '',
      title: group.title,
    });
    const existingDuplicateReason = getDuplicateReason(
      {
        extension: primaryEntry.extension,
        platform: group.platform,
        romFiles,
        sourcePath: primaryEntry.sourcePath,
        title: group.title,
      },
      existingGames,
    );
    const duplicateReason = existingDuplicateReason ?? (detectedKeys.has(duplicateKey) ? 'Already selected in this scan' : null);

    if (!duplicateReason) {
      detectedKeys.add(duplicateKey);
    }

    if (duplicateReason) {
      scanIssues.push({
        fileName: primaryEntry.fileName || primaryEntry.sourcePath || group.title,
        reason: duplicateReason,
        type: 'duplicate',
      });
    }

    return {
      duplicateReason,
      extension: primaryEntry.extension,
      fileName: primaryEntry.fileName,
      fileUri: primaryEntry.fileUri,
      id: `${groupIndex}-${group.key}`,
      isDuplicate: Boolean(duplicateReason),
      platform: group.platform,
      sourcePath: primaryEntry.sourcePath,
      title: group.title,
      normalizedTitle: group.normalizedTitle,
      romFiles,
      fileCount: romFiles.length,
      discCount,
    };
  });

  return {
    detectedRoms,
    summary: {
      detectedGames: detectedRoms.length,
      scanIssues,
      scannedFiles: files.length,
      unsupportedFiles,
    },
  };
}

export function mapDetectedRomToGame(rom: DetectedRom, existingGameIds: Set<string>, importedAt = new Date().toISOString()): Game {
  return {
    id: createRetroGameId(rom, existingGameIds),
    title: rom.title,
    platform: rom.platform,
    status: 'Want to play',
    coverImage: '',
    playtimeHours: 0,
    tags: ['retro', 'rom'],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
    externalSource: 'retro-rom',
    importedAt,
    romFileName: rom.fileName,
    romPath: rom.sourcePath,
    romUri: rom.fileUri ?? rom.sourcePath,
    romExtension: rom.extension,
    romFiles: rom.romFiles,
  };
}

export function getRomDuplicateKey(input: Pick<DetectedRom, 'extension' | 'platform' | 'sourcePath' | 'title'>) {
  const normalizedPath = input.sourcePath.trim().toLowerCase();

  if (normalizedPath) {
    return `path:${normalizedPath}`;
  }

  return `fallback:${input.platform}:${normalizeTitle(input.title)}`;
}

function groupRomEntries(entries: RomScanEntry[]): RomGroup[] {
  const groups = new Map<string, RomGroup>();
  const descriptorEntries = entries.filter((entry) => descriptorExtensions.has(entry.extension));
  const descriptorGroupsByFolder = new Map<string, RomGroup[]>();

  for (const entry of descriptorEntries) {
    const group = getOrCreateGroup(groups, getTitleGroupKey(entry), entry);
    descriptorGroupsByFolder.set(entry.parentFolder, [...(descriptorGroupsByFolder.get(entry.parentFolder) ?? []), group]);
  }

  for (const entry of entries) {
    if (descriptorExtensions.has(entry.extension)) {
      continue;
    }

    const descriptorGroup = findDescriptorGroupForCompanion(entry, descriptorGroupsByFolder);

    if (!descriptorGroup && !entry.normalizedTitle && isDescriptorTrackFile(entry.fileName)) {
      continue;
    }

    const group = descriptorGroup ?? getOrCreateGroup(groups, getTitleGroupKey(entry), entry);

    if (!group.entries.includes(entry)) {
      group.entries.push(entry);
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    entries: group.entries.sort((first, second) => first.index - second.index),
  }));
}

function findDescriptorGroupForCompanion(entry: RomScanEntry, descriptorGroupsByFolder: Map<string, RomGroup[]>) {
  if (!descriptorCompanionExtensions.has(entry.extension)) {
    return null;
  }

  const folderGroups = descriptorGroupsByFolder.get(entry.parentFolder) ?? [];
  if (folderGroups.length === 0) {
    return null;
  }

  const matchingTitleGroup = folderGroups.find((group) => group.normalizedTitle === entry.normalizedTitle);
  if (matchingTitleGroup) {
    return matchingTitleGroup;
  }

  if (isDescriptorTrackFile(entry.fileName) && folderGroups.length === 1) {
    return folderGroups[0];
  }

  return null;
}

function getOrCreateGroup(groups: Map<string, RomGroup>, key: string, entry: RomScanEntry) {
  const existingGroup = groups.get(key);

  if (existingGroup) {
    existingGroup.entries.push(entry);
    return existingGroup;
  }

  const group: RomGroup = {
    entries: [entry],
    key,
    normalizedTitle: entry.normalizedTitle,
    platform: entry.platform,
    title: entry.title,
  };
  groups.set(key, group);
  return group;
}

function getTitleGroupKey(entry: RomScanEntry) {
  const titleKey = entry.normalizedTitle || normalizeRomFilename(entry.parentFolder) || normalizeTitle(entry.title);
  return `${entry.platform}:${titleKey}`;
}

function getPreferredPrimaryEntry(entries: RomScanEntry[]) {
  return [...entries].sort((first, second) => getPrimaryExtensionRank(first.extension) - getPrimaryExtensionRank(second.extension) || first.index - second.index)[0];
}

function getPrimaryExtensionRank(extension: string) {
  if (extension === 'cue' || extension === 'gdi') {
    return 0;
  }

  if (extension === 'chd') {
    return 1;
  }

  if (extension === 'iso' || extension === 'cso' || extension === 'rvz') {
    return 2;
  }

  if (extension === 'bin' || extension === 'raw') {
    return 9;
  }

  return 3;
}

function entryToRomFile(entry: RomScanEntry): RomFileReference {
  return {
    extension: entry.extension,
    fileName: entry.fileName,
    path: entry.sourcePath,
    uri: entry.fileUri ?? undefined,
    role: descriptorExtensions.has(entry.extension) ? 'primary' : descriptorCompanionExtensions.has(entry.extension) ? 'track' : 'file',
  };
}

function countGroupedDiscs(entries: RomScanEntry[]) {
  const discLabels = new Set<string>();

  entries.forEach((entry) => {
    const label = getDiscLabel(entry.fileName);
    if (label) {
      discLabels.add(label);
    }
  });

  if (discLabels.size > 0) {
    return discLabels.size;
  }

  const descriptorCount = entries.filter((entry) => descriptorExtensions.has(entry.extension)).length;
  return descriptorCount > 1 ? descriptorCount : 1;
}

function getDuplicateReason(
  rom: Pick<DetectedRom, 'extension' | 'platform' | 'sourcePath' | 'title'> & { romFiles?: RomFileReference[] },
  existingGames: Game[],
) {
  const romPaths = new Set([rom.sourcePath, ...(rom.romFiles ?? []).flatMap((file) => [file.path, file.uri ?? ''])].map((path) => path.trim().toLowerCase()).filter(Boolean));
  const fallbackKey = getRomDuplicateKey({ ...rom, sourcePath: '' });

  const duplicate = existingGames.find((game) => {
    const gamePaths = new Set([
      game.romPath ?? '',
      game.romUri ?? '',
      ...(game.romFiles ?? []).flatMap((file) => [file.path, file.uri ?? '']),
    ].map((path) => path.trim().toLowerCase()).filter(Boolean));

    if (Array.from(romPaths).some((romPath) => gamePaths.has(romPath))) {
      return true;
    }

    if (!game.romExtension) {
      return false;
    }

    return (
      getRomDuplicateKey({
        extension: game.romExtension,
        platform: game.platform,
        sourcePath: '',
        title: game.title,
      }) === fallbackKey
    );
  });

  return duplicate ? 'Already in library' : null;
}

function inferPlatform(sourcePath: string, extension: string): GamePlatform {
  const normalizedPath = sourcePath.toLowerCase();
  const folderMatch = folderPlatformHints.find(([pattern]) => pattern.test(normalizedPath));

  if (folderMatch) {
    return folderMatch[1];
  }

  if (extension === 'iso' || extension === 'chd' || extension === 'cue' || extension === 'bin' || extension === 'raw') {
    return 'Other';
  }

  return extensionPlatformMap.get(extension) ?? 'Other';
}

export function cleanupRomTitle(fileName: string) {
  const withoutExtension = stripFileExtension(getFileNameFromPath(fileName) || fileName);
  const normalized = normalizeRomFilename(withoutExtension);

  return toDisplayTitle(normalized || withoutExtension);
}

export function normalizeRomFilename(fileName: string) {
  return stripFileExtension(getFileNameFromPath(fileName) || fileName)
    .replace(/[_\.]+/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\((?:disc|disk)\s*\d+\s*(?:of\s*\d+)?\)/gi, ' ')
    .replace(/\b(?:disc|disk)\s*\d+\s*(?:of\s*\d+)?\b/gi, ' ')
    .replace(/\bcd\s*\d+\b/gi, ' ')
    .replace(/\btrack\s*\d+\b/gi, ' ')
    .replace(/\((?:usa|europe|japan|world|korea|france|germany|italy|spain|australia|en|fr|de|es|it|jp)\b[^)]*\)/gi, ' ')
    .replace(/\((?:rev(?:ision)?\s*\d+|v\d+(?:\.\d+)*|beta|demo)\)/gi, ' ')
    .replace(/\[(?:!|[abhfto](?:[+\-]?\d*)?|[a-z]\d*|trimmed|xci|nsp|rvz|wua|wux|hack|overdump|translation)\]/gi, ' ')
    .replace(/\b(?:side)\s*[ab]\b/gi, ' ')
    .replace(/\s*[-–—]+\s*$/g, ' ')
    .replace(/^\s*[-–—]+\s*/g, ' ')
    .replace(/\s*[-–—]+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();
}

function toDisplayTitle(normalizedTitle: string) {
  return normalizedTitle
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length <= 3 && /^(usa|psp|ps1|ps2|nes|snes|gba|gbc|nds|wii|cd)$/.test(word) ? word.toUpperCase() : word.slice(0, 1).toUpperCase() + word.slice(1)))
    .join(' ')
    .trim();
}

function createRetroGameId(rom: DetectedRom, existingGameIds: Set<string>) {
  const baseSlug =
    `${rom.platform}-${rom.title}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'retro-rom';
  let id = `retro-${baseSlug}`;
  let suffix = 2;

  while (existingGameIds.has(id)) {
    id = `retro-${baseSlug}-${suffix}`;
    suffix += 1;
  }

  existingGameIds.add(id);
  return id;
}

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getFileSourcePath(file: ScannableRomFile) {
  return file.webkitRelativePath || file.path || file.name;
}

function getFileUri(file: ScannableRomFile) {
  return typeof file.uri === 'string' && file.uri.trim() ? file.uri.trim() : null;
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '');
}

function getFileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function getParentFolder(path: string) {
  const normalizedPath = path.replace(/\\/g, '/');
  const index = normalizedPath.lastIndexOf('/');
  return index >= 0 ? normalizedPath.slice(0, index).toLowerCase() : '';
}

function isDescriptorTrackFile(fileName: string) {
  return /(?:^|[^a-z0-9])track\s*\d+/i.test(fileName) || /^track\d+/i.test(stripFileExtension(fileName));
}

function getDiscLabel(fileName: string) {
  return fileName.match(/\b(?:disc|disk|cd)\s*(\d+)\b/i)?.[1] ?? null;
}
