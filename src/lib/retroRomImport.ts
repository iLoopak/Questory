import type { Game, GamePlatform } from '../types/game';

export const autoDetectPlatformOption = 'Auto-detect';

export const retroImportPlatforms = [
  'PSP',
  'PS2',
  'PS1',
  'PS Vita',
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
  'bin',
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
]);

const folderPlatformHints: Array<[RegExp, GamePlatform]> = [
  [/(^|[^a-z0-9])psp([^a-z0-9]|$)/, 'PSP'],
  [/(^|[^a-z0-9])ps2([^a-z0-9]|$)/, 'PS2'],
  [/(^|[^a-z0-9])ps1([^a-z0-9]|$)/, 'PS1'],
  [/(^|[^a-z0-9])(vita|psvita)([^a-z0-9]|$)/, 'PS Vita'],
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

  const detectedRoms = files.flatMap((file, index) => {
    const sourcePath = getFileSourcePath(file);
    const fileUri = getFileUri(file);
    const extension = getFileExtension(file.name);

    if (!supportedRomExtensions.has(extension)) {
      unsupportedFiles += 1;
      scanIssues.push({
        fileName: file.name || sourcePath || `File ${index + 1}`,
        reason: extension ? `.${extension} is not a supported ROM format yet.` : 'No file extension was found.',
        type: 'unsupported-format',
      });
      return [];
    }

    const title = cleanupRomTitle(file.name || sourcePath);
    if (!title) {
      scanIssues.push({
        fileName: file.name || sourcePath || `File ${index + 1}`,
        reason: 'QuestShelf could not create a readable game title from this file name.',
        type: 'empty-title',
      });
      return [];
    }

    const platform =
      platformOverride === autoDetectPlatformOption
        ? inferPlatform(sourcePath, extension)
        : (platformOverride as GamePlatform);
    const duplicateKey = getRomDuplicateKey({ extension, platform, sourcePath, title });
    const existingDuplicateReason = getDuplicateReason({ extension, platform, sourcePath, title }, existingGames);
    const duplicateReason = existingDuplicateReason ?? (detectedKeys.has(duplicateKey) ? 'Already selected in this scan' : null);

    if (!duplicateReason) {
      detectedKeys.add(duplicateKey);
    }

    if (duplicateReason) {
      scanIssues.push({
        fileName: file.name || sourcePath || title,
        reason: duplicateReason,
        type: 'duplicate',
      });
    }

    return [
      {
        duplicateReason,
        extension,
        fileName: file.name,
        fileUri,
        id: `${index}-${sourcePath}`,
        isDuplicate: Boolean(duplicateReason),
        platform,
        sourcePath,
        title,
      },
    ];
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
  };
}

export function getRomDuplicateKey(input: Pick<DetectedRom, 'extension' | 'platform' | 'sourcePath' | 'title'>) {
  const normalizedPath = input.sourcePath.trim().toLowerCase();

  if (normalizedPath) {
    return `path:${normalizedPath}`;
  }

  return `fallback:${input.platform}:${normalizeTitle(input.title)}:${input.extension}`;
}

function getDuplicateReason(
  rom: Pick<DetectedRom, 'extension' | 'platform' | 'sourcePath' | 'title'>,
  existingGames: Game[],
) {
  const romPath = rom.sourcePath.trim().toLowerCase();
  const fallbackKey = getRomDuplicateKey({ ...rom, sourcePath: '' });

  const duplicate = existingGames.find((game) => {
    const gamePath = (game.romPath ?? game.romUri ?? '').trim().toLowerCase();

    if (romPath && gamePath && romPath === gamePath) {
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

  if (extension === 'iso' || extension === 'chd' || extension === 'cue' || extension === 'bin') {
    return 'Other';
  }

  return extensionPlatformMap.get(extension) ?? 'Other';
}

function cleanupRomTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_\.]+/g, ' ')
    .replace(/\s*\{[^}]*\}/g, '')
    .replace(/\((usa|europe|japan|world|korea|france|germany|italy|spain|australia|en|fr|de|es|it|jp)[^)]*\)/gi, '')
    .replace(/\((rev(?:ision)?\s*\d+|v\d+(?:\.\d+)*)\)/gi, '')
    .replace(/\[(?:!|b|h|f|o|t[+\-][^\]]+|[a-z]\d*|trimmed|xci|nsp|rvz|wua|wux)\]/gi, '')
    .replace(/\b(?:disc|disk)\s*\d+\b/gi, '')
    .replace(/\b(?:side)\s*[ab]\b/gi, '')
    .replace(/\s+-\s+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function createRetroGameId(rom: DetectedRom, existingGameIds: Set<string>) {
  const baseSlug =
    `${rom.platform}-${rom.title}-${rom.extension}`
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
