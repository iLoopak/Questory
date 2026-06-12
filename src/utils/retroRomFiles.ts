import type { GamePlatform, RomFileReference } from '../types/game';

export type RomScanEntry = {
  extension: string;
  file?: unknown;
  fileName: string;
  fileUri: string | null;
  index: number;
  normalizedTitle: string;
  parentFolder: string;
  platform: GamePlatform;
  sourcePath: string;
  title: string;
};

export type RomGroup = {
  entries: RomScanEntry[];
  key: string;
  normalizedTitle: string;
  platform: GamePlatform;
  title: string;
};

export const descriptorExtensions = new Set(['cue', 'gdi']);
export const descriptorCompanionExtensions = new Set(['bin', 'raw']);

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

export function groupRomEntries(entries: RomScanEntry[]): RomGroup[] {
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

export function getPreferredPrimaryEntry(entries: RomScanEntry[]) {
  return [...entries].sort((first, second) => getPrimaryExtensionRank(first.extension) - getPrimaryExtensionRank(second.extension) || first.index - second.index)[0];
}

export function entryToRomFile(entry: RomScanEntry): RomFileReference {
  return {
    extension: entry.extension,
    fileName: entry.fileName,
    path: entry.sourcePath,
    uri: entry.fileUri ?? undefined,
    role: descriptorExtensions.has(entry.extension) ? 'primary' : descriptorCompanionExtensions.has(entry.extension) ? 'track' : 'file',
  };
}

export function countGroupedDiscs(entries: RomScanEntry[]) {
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

export function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getFileSourcePath(file: { name: string; path?: string; webkitRelativePath?: string }) {
  return file.webkitRelativePath || file.path || file.name;
}

export function getFileUri(file: { uri?: string }) {
  return typeof file.uri === 'string' && file.uri.trim() ? file.uri.trim() : null;
}

export function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

export function getFileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function getParentFolder(path: string) {
  const normalizedPath = path.replace(/\\/g, '/');
  const index = normalizedPath.lastIndexOf('/');
  return index >= 0 ? normalizedPath.slice(0, index).toLowerCase() : '';
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

function toDisplayTitle(normalizedTitle: string) {
  return normalizedTitle
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length <= 3 && /^(usa|psp|ps1|ps2|nes|snes|gba|gbc|nds|wii|cd)$/.test(word) ? word.toUpperCase() : word.slice(0, 1).toUpperCase() + word.slice(1)))
    .join(' ')
    .trim();
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '');
}

function isDescriptorTrackFile(fileName: string) {
  return /(?:^|[^a-z0-9])track\s*\d+/i.test(fileName) || /^track\d+/i.test(stripFileExtension(fileName));
}

function getDiscLabel(fileName: string) {
  return fileName.match(/\b(?:disc|disk|cd)\s*(\d+)\b/i)?.[1] ?? null;
}
