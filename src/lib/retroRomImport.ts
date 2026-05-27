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

export type DetectedRom = {
  duplicateReason: string | null;
  extension: string;
  fileName: string;
  id: string;
  isDuplicate: boolean;
  platform: GamePlatform;
  sourcePath: string;
  title: string;
};

export type RetroScanSummary = {
  detectedGames: number;
  scannedFiles: number;
  unsupportedFiles: number;
};

const supportedRomExtensions = new Set([
  'iso',
  'chd',
  'cso',
  'cue',
  'bin',
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
  [/(^|[^a-z0-9])wii([^a-z0-9]|$)/, 'Wii'],
  [/(^|[^a-z0-9])(gamecube|gc)([^a-z0-9]|$)/, 'GameCube'],
  [/(^|[^a-z0-9])(genesis|megadrive)([^a-z0-9]|$)/, 'Sega Genesis / Mega Drive'],
  [/(^|[^a-z0-9])sms([^a-z0-9]|$)/, 'Master System'],
  [/(^|[^a-z0-9])gamegear([^a-z0-9]|$)/, 'Game Gear'],
];

export function scanRomFiles(
  files: File[],
  existingGames: Game[],
  platformOverride: RetroPlatformOverride,
): { detectedRoms: DetectedRom[]; summary: RetroScanSummary } {
  let unsupportedFiles = 0;

  const detectedRoms = files.flatMap((file, index) => {
    const sourcePath = getFileSourcePath(file);
    const extension = getFileExtension(file.name);

    if (!supportedRomExtensions.has(extension)) {
      unsupportedFiles += 1;
      return [];
    }

    const title = cleanupRomTitle(file.name);
    const platform =
      platformOverride === autoDetectPlatformOption
        ? inferPlatform(sourcePath, extension)
        : (platformOverride as GamePlatform);
    const duplicateReason = getDuplicateReason({ extension, platform, sourcePath, title }, existingGames);

    return [
      {
        duplicateReason,
        extension,
        fileName: file.name,
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
    romUri: rom.sourcePath,
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
    .replace(/\((usa|europe|japan|world|korea|france|germany|italy|spain|australia|en|fr|de|es|it|jp)[^)]*\)/gi, '')
    .replace(/\((rev(?:ision)?\s*\d+|v\d+(?:\.\d+)*)\)/gi, '')
    .replace(/\[(?:!|b|h|f|o|t[+\-][^\]]+|[a-z]\d*)\]/gi, '')
    .replace(/\b(?:disc|disk)\s*\d+\b/gi, '')
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

function getFileSourcePath(file: File) {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}
