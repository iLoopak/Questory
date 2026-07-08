import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createQuestShelfBackup,
  mergeQuestShelfBackup,
  parseQuestShelfBackupText,
  restoreQuestShelfBackup,
  questShelfAppVersion,
  questShelfBackupVersion,
  type QuestShelfBackup,
} from '../src/lib/backupStorage';
import {
  loadAchievementCounters,
  saveAchievementCounters,
  normalizeAchievementCounters,
  type AchievementCounters,
} from '../src/lib/achievementCounters';
import { setStorageAdapter, type StorageAdapter } from '../src/lib/storageAdapter';

const ACHIEVEMENT_COUNTERS_KEY = 'questshelf.achievementCounters.v1';
const RAWG_SETTINGS_KEY = 'questshelf.rawgSettings.v1';
const STEAM_GRID_DB_SETTINGS_KEY = 'questshelf.steamGridDbSettings.v1';
const ITAD_SETTINGS_KEY = 'questshelf.isThereAnyDealSettings.v1';
const STEAM_SETTINGS_KEY = 'questshelf.steamSettings.v1';

// Install a fresh in-memory browser storage (window.localStorage) + StorageAdapter
// backed by the same map, so createQuestShelfBackup's raw reads, restore/merge writes,
// and loadAchievementCounters all round-trip against one hermetic store in Node.
function installMemoryStorage() {
  const store = new Map<string, string>();

  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };

  (globalThis as unknown as { window: unknown }).window = {
    localStorage,
    dispatchEvent: () => true,
  };

  const adapter: StorageAdapter = {
    readLocal: (key) => (store.has(key) ? store.get(key)! : null),
    writeLocal: (key, value) => { store.set(key, value); },
    removeLocal: (key) => { store.delete(key); },
    localKeys: () => [...store.keys()],
    readDurable: async () => null,
    writeDurable: async () => {},
    removeDurable: async () => {},
    hasDurableBackend: async () => false,
  };
  setStorageAdapter(adapter);

  return { store };
}

function makeCounters(overrides: Partial<AchievementCounters> = {}): AchievementCounters {
  return normalizeAchievementCounters({
    questRunnerRuns: 3,
    questRunnerBestScore: 120,
    backupExportedEver: true,
    activeDays: ['2026-07-01', '2026-07-02'],
    ...overrides,
  });
}

// A freshly-exported backup, mirroring createQuestShelfBackup's browser output shape
// (an object achievement-counters section plus the collection sections).
function makeFreshBackup(dataOverrides: Record<string, unknown> = {}): QuestShelfBackup {
  return {
    app: 'Questory',
    schemaVersion: questShelfBackupVersion,
    metadata: {
      appVersion: questShelfAppVersion,
      exportedAt: new Date().toISOString(),
      includesIntegrationSettings: false,
      includesSecrets: false,
      schemaVersion: questShelfBackupVersion,
    },
    data: {
      [ACHIEVEMENT_COUNTERS_KEY]: makeCounters(),
      'questshelf.games.v1': [],
      'questshelf.rawgMetadataCache.v1': {},
      'questshelf.playActivity.v1': [],
      ...dataOverrides,
    },
  } as QuestShelfBackup;
}

function parseOrThrow(backup: QuestShelfBackup) {
  const result = parseQuestShelfBackupText(JSON.stringify(backup));
  if (!result.ok) {
    throw new Error(`Expected backup to validate, got: ${result.error}`);
  }
  return result.backup;
}

test('a freshly exported backup with achievement counters validates for import', () => {
  installMemoryStorage();
  const result = parseQuestShelfBackupText(JSON.stringify(makeFreshBackup()));
  assert.equal(result.ok, true, result.ok ? '' : result.error);
});

test('export -> restore roundtrip preserves achievement counters', () => {
  installMemoryStorage();
  saveAchievementCounters(makeCounters({ questRunnerRuns: 9, justBrowsingOpens: 4 }));

  const exported = createQuestShelfBackup(false);
  // The real exporter must include the counters section (this is the regression source).
  assert.ok(
    Object.prototype.hasOwnProperty.call(exported.data, ACHIEVEMENT_COUNTERS_KEY),
    'exported backup should contain the achievement counters section',
  );

  const parsed = parseOrThrow(exported);
  restoreQuestShelfBackup(parsed);

  const restored = loadAchievementCounters();
  assert.equal(restored.questRunnerRuns, 9);
  assert.equal(restored.justBrowsingOpens, 4);
});

test('export without integration secrets excludes locally stored API keys', () => {
  const { store } = installMemoryStorage();
  store.set(RAWG_SETTINGS_KEY, JSON.stringify({ apiKey: 'rawg-secret' }));
  store.set(STEAM_GRID_DB_SETTINGS_KEY, JSON.stringify({ apiKey: 'sgdb-secret' }));
  store.set(ITAD_SETTINGS_KEY, JSON.stringify({ apiKey: 'itad-secret' }));
  store.set(STEAM_SETTINGS_KEY, JSON.stringify({ apiKey: 'steam-secret', steamId64: '76561198000000000' }));

  const exported = createQuestShelfBackup(false);

  assert.equal(exported.metadata.includesIntegrationSettings, false);
  assert.equal(exported.metadata.includesSecrets, false);
  assert.equal(Object.prototype.hasOwnProperty.call(exported.data, RAWG_SETTINGS_KEY), false);
  assert.equal(Object.prototype.hasOwnProperty.call(exported.data, STEAM_GRID_DB_SETTINGS_KEY), false);
  assert.equal(Object.prototype.hasOwnProperty.call(exported.data, ITAD_SETTINGS_KEY), false);
  assert.equal(Object.prototype.hasOwnProperty.call(exported.data, STEAM_SETTINGS_KEY), false);
  assert.doesNotMatch(JSON.stringify(exported), /rawg-secret|sgdb-secret|itad-secret|steam-secret/);
});

test('export with integration secrets includes locally stored API keys explicitly', () => {
  const { store } = installMemoryStorage();
  store.set(RAWG_SETTINGS_KEY, JSON.stringify({ apiKey: 'rawg-secret' }));
  store.set(STEAM_GRID_DB_SETTINGS_KEY, JSON.stringify({ apiKey: 'sgdb-secret' }));
  store.set(ITAD_SETTINGS_KEY, JSON.stringify({ apiKey: 'itad-secret' }));
  store.set(STEAM_SETTINGS_KEY, JSON.stringify({ apiKey: 'steam-secret', steamId64: '76561198000000000' }));

  const exported = createQuestShelfBackup(true);

  assert.equal(exported.metadata.includesIntegrationSettings, true);
  assert.equal(exported.metadata.includesSecrets, true);
  assert.deepEqual(exported.data[RAWG_SETTINGS_KEY], { apiKey: 'rawg-secret' });
  assert.deepEqual(exported.data[STEAM_GRID_DB_SETTINGS_KEY], { apiKey: 'sgdb-secret' });
  assert.deepEqual(exported.data[ITAD_SETTINGS_KEY], { apiKey: 'itad-secret' });
  assert.deepEqual(exported.data[STEAM_SETTINGS_KEY], { apiKey: 'steam-secret', steamId64: '76561198000000000' });
});

test('restore with integration secrets restores locally stored API keys', () => {
  const { store } = installMemoryStorage();
  const backup = parseOrThrow(makeFreshBackup({
    [RAWG_SETTINGS_KEY]: { apiKey: 'rawg-secret' },
    [STEAM_GRID_DB_SETTINGS_KEY]: { apiKey: 'sgdb-secret' },
    [ITAD_SETTINGS_KEY]: { apiKey: 'itad-secret' },
    [STEAM_SETTINGS_KEY]: { apiKey: 'steam-secret', steamId64: '76561198000000000' },
  }));

  restoreQuestShelfBackup(backup);

  assert.deepEqual(JSON.parse(store.get(RAWG_SETTINGS_KEY)!), { apiKey: 'rawg-secret' });
  assert.deepEqual(JSON.parse(store.get(STEAM_GRID_DB_SETTINGS_KEY)!), { apiKey: 'sgdb-secret' });
  assert.deepEqual(JSON.parse(store.get(ITAD_SETTINGS_KEY)!), { apiKey: 'itad-secret' });
  assert.deepEqual(JSON.parse(store.get(STEAM_SETTINGS_KEY)!), { apiKey: 'steam-secret', steamId64: '76561198000000000', wishlistUrl: '' });
});

test('replace restore from backup without integration secrets preserves existing API keys', () => {
  const { store } = installMemoryStorage();
  store.set(RAWG_SETTINGS_KEY, JSON.stringify({ apiKey: 'existing-rawg' }));
  store.set(STEAM_SETTINGS_KEY, JSON.stringify({ apiKey: 'existing-steam', steamId64: '76561198000000000' }));

  restoreQuestShelfBackup(parseOrThrow(makeFreshBackup()));

  assert.deepEqual(JSON.parse(store.get(RAWG_SETTINGS_KEY)!), { apiKey: 'existing-rawg' });
  assert.deepEqual(JSON.parse(store.get(STEAM_SETTINGS_KEY)!), { apiKey: 'existing-steam', steamId64: '76561198000000000' });
});

test('export -> merge roundtrip applies the backup achievement counters', () => {
  installMemoryStorage();
  // Local state differs from the backup; a present section overwrites on merge.
  saveAchievementCounters(makeCounters({ questRunnerRuns: 1 }));

  const backup = parseOrThrow(makeFreshBackup({
    [ACHIEVEMENT_COUNTERS_KEY]: makeCounters({ questRunnerRuns: 42 }),
  }));
  mergeQuestShelfBackup(backup);

  assert.equal(loadAchievementCounters().questRunnerRuns, 42);
});

test('backup missing the achievement counters section still imports', () => {
  installMemoryStorage();
  const backup = makeFreshBackup();
  delete (backup.data as Record<string, unknown>)[ACHIEVEMENT_COUNTERS_KEY];

  const result = parseQuestShelfBackupText(JSON.stringify(backup));
  assert.equal(result.ok, true, result.ok ? '' : result.error);

  // Restore has replace semantics: an absent section resets counters to safe defaults.
  restoreQuestShelfBackup(parseOrThrow(backup));
  assert.deepEqual(loadAchievementCounters(), normalizeAchievementCounters(undefined));
});

test('partial achievement counters are normalized to safe defaults on import', () => {
  installMemoryStorage();
  const backup = makeFreshBackup({ [ACHIEVEMENT_COUNTERS_KEY]: { questRunnerRuns: 7 } });

  const result = parseQuestShelfBackupText(JSON.stringify(backup));
  assert.equal(result.ok, true, result.ok ? '' : result.error);

  restoreQuestShelfBackup(parseOrThrow(backup));
  const restored = loadAchievementCounters();
  assert.equal(restored.questRunnerRuns, 7);
  assert.equal(restored.justBrowsingOpens, 0);
  assert.equal(restored.playingStreak, null);
  assert.deepEqual(restored.activeDays, []);
});

test('invalid achievement counters do not block import and normalize safely', () => {
  installMemoryStorage();
  for (const corrupt of ['definitely-not-counters', 42, [], null]) {
    const backup = makeFreshBackup({ [ACHIEVEMENT_COUNTERS_KEY]: corrupt });
    const result = parseQuestShelfBackupText(JSON.stringify(backup));
    assert.equal(result.ok, true, `corrupt counters (${JSON.stringify(corrupt)}) must not block import`);

    restoreQuestShelfBackup(parseOrThrow(backup));
    assert.deepEqual(loadAchievementCounters(), normalizeAchievementCounters(undefined));
  }
});

test('a truly malformed critical section still blocks import (validation not over-weakened)', () => {
  installMemoryStorage();
  // games must be an array; an object here is genuine corruption and must be rejected.
  const result = parseQuestShelfBackupText(
    JSON.stringify(makeFreshBackup({ 'questshelf.games.v1': { not: 'an array' } })),
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.error, /game library/);
});

test('older QuestShelf-branded backups without counters remain importable', () => {
  installMemoryStorage();
  const backup = makeFreshBackup();
  backup.app = 'QuestShelf';
  delete (backup.data as Record<string, unknown>)[ACHIEVEMENT_COUNTERS_KEY];

  const result = parseQuestShelfBackupText(JSON.stringify(backup));
  assert.equal(result.ok, true, result.ok ? '' : result.error);
});

test('older backups without explicit secret metadata remain importable as no-secret backups', () => {
  installMemoryStorage();
  const backup = makeFreshBackup();
  delete (backup.metadata as Partial<QuestShelfBackup['metadata']>).includesIntegrationSettings;
  delete (backup.metadata as Partial<QuestShelfBackup['metadata']>).includesSecrets;

  const result = parseQuestShelfBackupText(JSON.stringify(backup));

  assert.equal(result.ok, true, result.ok ? '' : result.error);
  if (result.ok) {
    assert.equal(result.backup.metadata.includesIntegrationSettings, false);
    assert.equal(result.backup.metadata.includesSecrets, false);
  }
});

test('export includes custom empty platform plans', () => {
  const { store } = installMemoryStorage();
  const platformQueueState = {
    activePlatforms: ['Analogue Pocket'],
    entries: [],
    schemaVersion: 1,
    settings: [],
  };
  store.set('questshelf.platformQueues.v1', JSON.stringify(platformQueueState));

  const exported = createQuestShelfBackup(false);
  assert.deepEqual(exported.data['questshelf.platformQueues.v1'], platformQueueState);
});
