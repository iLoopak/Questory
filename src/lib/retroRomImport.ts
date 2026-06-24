import type { Game, GamePlatform, RomFileReference } from '../types/game';
import {
  cleanupRomTitle,
  countGroupedDiscs,
  entryToRomFile,
  getFileExtension,
  getFileNameFromPath,
  getFileSourcePath,
  getFileUri,
  getParentFolder,
  getPreferredPrimaryEntry,
  groupRomEntries,
  normalizeRomFilename,
  normalizeTitle,
  type RomScanEntry,
} from '../utils/retroRomFiles';

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
    if (!normalizedTitle || !title) {
      scanIssues.push({
        fileName,
        reason: 'Questory could not create a readable game title from this file name.',
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
