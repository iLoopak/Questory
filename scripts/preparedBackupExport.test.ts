import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createControllableStorageAdapter } from './testUtils/controllableStorageAdapter';
import { makeLibraryGame } from './testUtils/gameFixtures';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import type { QuestShelfBackup } from '../src/lib/backupStorage';

assertTestEnvironment();

const { registerCanonicalCollectionOwner, resetCanonicalCollectionOwner } = await import('../src/lib/canonicalCollections');
const { exportPreparedQuestShelfBackupFile, prepareQuestShelfBackup } = await import('../src/lib/backupExport');
const { savePersistedJson } = await import('../src/lib/localPersistence');
const { localStoragePreferencesAdapter, setStorageAdapter } = await import('../src/lib/storageAdapter');
const { resetDurableKvQueues } = await import('../src/lib/kvDurableQueue');

function installOwner(games = [makeLibraryGame({ id: 'game-1', title: 'Original title' })]) {
  resetCanonicalCollectionOwner();
  return registerCanonicalCollectionOwner({
    replaceGames: () => {},
    replacePlayActivity: () => {},
    prepareBackup: async () => ({ games, playActivity: [] }),
  });
}

function cleanup(unregister?: () => void) {
  unregister?.();
  resetCanonicalCollectionOwner();
  resetDurableKvQueues();
  setStorageAdapter(localStoragePreferencesAdapter);
  resetWebStorage();
}

test('PR-08: editing a title and exporting in the same tick uses the canonical owner snapshot', async () => {
  resetWebStorage();
  setStorageAdapter(localStoragePreferencesAdapter);
  const unregister = installOwner([makeLibraryGame({ id: 'game-1', title: 'Edited this tick' })]);
  try {
    const backup = await prepareQuestShelfBackup(false);
    assert.equal((backup.data['questshelf.games.v1'] as Array<{ title: string }>)[0].title, 'Edited this tick');
  } finally { cleanup(unregister); }
});

test('PR-08: importing games and immediately exporting includes the complete imported snapshot', async () => {
  resetWebStorage();
  setStorageAdapter(localStoragePreferencesAdapter);
  const imported = [
    makeLibraryGame({ id: 'import-1', title: 'Imported One' }),
    makeLibraryGame({ id: 'import-2', title: 'Imported Two' }),
  ];
  const unregister = installOwner(imported);
  try {
    const backup = await prepareQuestShelfBackup(false);
    assert.deepEqual((backup.data['questshelf.games.v1'] as Array<{ id: string }>).map((game) => game.id), ['import-1', 'import-2']);
  } finally { cleanup(unregister); }
});

test('PR-08: changing a Platform Plan and immediately exporting includes that local KV value', async () => {
  resetWebStorage();
  setStorageAdapter(localStoragePreferencesAdapter);
  resetDurableKvQueues();
  const unregister = installOwner();
  const plan = { schemaVersion: 2, activePlatforms: ['PC'], plans: [{ id: 'platform-plan-pc', platform: 'PC', gameIds: ['game-1'] }], settings: [] };
  try {
    savePersistedJson('questshelf.platformQueues.v1', plan);
    const backup = await prepareQuestShelfBackup(false);
    assert.deepEqual(backup.data['questshelf.platformQueues.v1'], plan);
  } finally { cleanup(unregister); }
});

test('PR-08: preparation waits for a pending durable KV write', async () => {
  resetWebStorage();
  resetDurableKvQueues();
  const storage = createControllableStorageAdapter({ durableMode: 'manual' });
  setStorageAdapter(storage.adapter);
  const unregister = installOwner();
  try {
    savePersistedJson('questshelf.platformQueues.v1', { changed: true });
    let settled = false;
    const pending = prepareQuestShelfBackup(false).then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(settled, false);
    assert.ok(storage.pendingOperations().length > 0);
    storage.setDurableMode('auto');
    await storage.settleAll();
    await pending;
    assert.equal(settled, true);
  } finally { cleanup(unregister); }
});

test('PR-08: rejected collection flush blocks the exporter and never reports a file', async () => {
  resetWebStorage();
  setStorageAdapter(localStoragePreferencesAdapter);
  resetCanonicalCollectionOwner();
  const unregister = registerCanonicalCollectionOwner({
    replaceGames: () => {}, replacePlayActivity: () => {},
    prepareBackup: async () => { throw new Error('IndexedDB write rejected'); },
  });
  let exporterCalls = 0;
  try {
    await assert.rejects(
      exportPreparedQuestShelfBackupFile(false, async () => { exporterCalls += 1; return { fileName: 'must-not-exist.json' }; }),
      /IndexedDB write rejected/,
    );
    assert.equal(exporterCalls, 0);
  } finally { cleanup(unregister); }
});

test('PR-08: browser and native exporters receive the exact prepared payload object', async () => {
  resetWebStorage();
  setStorageAdapter(localStoragePreferencesAdapter);
  const unregister = installOwner([makeLibraryGame({ id: 'same-payload', title: 'Same Payload' })]);
  try {
    for (const transport of ['browser', 'native'] as const) {
      let received: QuestShelfBackup | null = null;
      const result = await exportPreparedQuestShelfBackupFile(false, async (backup) => {
        received = backup;
        return { fileName: `${transport}.json` };
      });
      assert.strictEqual(received, result.backup, `${transport} receives the prepared object without reserialization/recreation`);
      assert.equal((result.backup.data['questshelf.games.v1'] as Array<{ id: string }>)[0].id, 'same-payload');
    }
  } finally { cleanup(unregister); }
});

test('PR-08: optional integration secrets use the same preparation policy', async () => {
  resetWebStorage();
  setStorageAdapter(localStoragePreferencesAdapter);
  const unregister = installOwner();
  window.localStorage.setItem('questshelf.rawgSettings.v1', JSON.stringify({ apiKey: 'test-secret' }));
  try {
    const withoutSecrets = await prepareQuestShelfBackup(false);
    const withSecrets = await prepareQuestShelfBackup(true);
    assert.equal(Object.prototype.hasOwnProperty.call(withoutSecrets.data, 'questshelf.rawgSettings.v1'), false);
    assert.deepEqual(withSecrets.data['questshelf.rawgSettings.v1'], { apiKey: 'test-secret' });
    assert.equal(withSecrets.metadata.includesSecrets, true);
  } finally { cleanup(unregister); }
});

test('PR-08: UI export surfaces cannot call the raw serializer', () => {
  const dataManagement = readFileSync('src/components/DataManagementPanel.tsx', 'utf8');
  const onboarding = readFileSync('src/components/OnboardingChecklist.tsx', 'utf8');
  const syncFolder = readFileSync('src/lib/syncFolderStorage.ts', 'utf8');
  assert.doesNotMatch(dataManagement, /createQuestShelfBackup/);
  assert.doesNotMatch(onboarding, /createQuestShelfBackup/);
  assert.doesNotMatch(syncFolder, /createQuestShelfBackup/);
  assert.match(dataManagement, /prepareQuestShelfBackup|exportPreparedQuestShelfBackupFile/);
  assert.match(onboarding, /exportPreparedQuestShelfBackupFile/);
});

test('PR-08: canonical owner flushes games, activity and the latest in-memory Platform Plan', () => {
  const source = readFileSync('src/features/app/useCanonicalCollectionOwner.ts', 'utf8');
  assert.match(source, /savePlatformQueueState\(platformQueueStateRef\.current\)/);
  assert.match(source, /flushGameWrites\(gamesSnapshot\)/);
  assert.match(source, /flushPlayActivityWrites\(playActivitySnapshot\)/);
  assert.match(source, /whenDurableKvSettled\(\)/);
});

test('PR-08: onboarding reports preparation failure and completes only after awaited export success', () => {
  const source = readFileSync('src/components/OnboardingChecklist.tsx', 'utf8');
  const backupStep = source.slice(source.indexOf('function BackupStep'), source.indexOf('function HowItWorksStep'));
  assert.match(backupStep, /await exportPreparedQuestShelfBackupFile\(false\)/);
  assert.match(backupStep, /catch \(error\)/);
  assert.match(backupStep, /Backup export failed/);
  assert.ok(backupStep.indexOf('onComplete();') > backupStep.indexOf('await exportPreparedQuestShelfBackupFile'));
});
