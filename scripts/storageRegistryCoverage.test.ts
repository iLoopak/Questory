/**
 * AS-18 — the registry is the complete inventory of Questory-owned storage, or this fails.
 *
 * The registry existed, but active product-owned keys lived outside it: the controller settings (a
 * value written through Capacitor Preferences and never hydrated back on native boot), the Neon
 * button style, the collection view modes, the HLTB cache, the Daily Quest and Achievement Quiz
 * history, the Quest Runner high score, the dismissed hints. Reset Local Data left every one of them
 * behind, because reset only removes what the registry describes.
 *
 * The coverage test below finds keys the way the app actually uses them — by resolving the argument
 * of each storage call — rather than by grepping for strings that look like keys. Questory's `qs-*`
 * namespace is mostly CSS class names, so a raw grep would be both noisy and, where a key is built
 * from a constant, blind.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  findStorageKeyFamily,
  isRegisteredStorageKey,
  persistentStorageKeys,
  preservedStorageKeys,
  storageKeyFamilyRegistry,
  storageKeyRegistry,
  type StorageKeyDescriptor,
} from '../src/lib/storageRegistry';

// ════════════════════════════════════════════════════════════════════════════════════
// Static discovery
// ════════════════════════════════════════════════════════════════════════════════════

/** Every call that reads or writes a persisted value, and the expression naming the key. */
const storageCallPattern = /(?:local|session)Storage\.(?:get|set|remove)Item\(\s*([^,)]+)|(?:save|load)PersistedJson(?:Durable)?\(\s*([^,)]+)|(?:read|write|remove)AppCacheValue\(\s*([^,)]+)|loadLocalJson\(\s*([^,)]+)/g;

/**
 * Modules that compute a key from a value they are GIVEN rather than from one they own: the KV
 * layer, the storage adapter, the IndexedDB cache wrapper, and the reset/backup code that loops over
 * the registry itself. They cannot introduce a key of their own — their callers do, and those calls
 * are what this test checks.
 */
const keyAgnosticModules = new Set([
  'src/lib/localPersistence.ts',
  'src/lib/storageAdapter.ts',
  'src/lib/indexedDbAppCache.ts',
  'src/lib/backupStorage.ts',
  'src/lib/storageDiagnostics.ts',
  'src/main.tsx',
]);

/**
 * Call sites whose key is built at runtime from a REGISTERED family, or read from a registered
 * constant that this resolver cannot follow. Each is named, with the family/key it belongs to.
 */
const dynamicKeyCallSites: Record<string, string> = {
  'src/lib/steamGridDbArtwork.ts': 'qs-sgdb-artwork: (registered family)',
  'src/hooks/useCollectionUiState.ts': 'questshelf.collectionViewMode.v1 (registered family) + the registered filter keys',
  'src/components/QueueGhost.tsx': 'qs-ghost-v1 (registered session key), passed as a parameter',
  'src/features/settings/SettingsView.tsx': 'the registered hint keys, reset in a loop by Settings → Hints',
  'src/services/personalRecommendationsService.ts': 'questshelf.personalRecommendations.v2 (registered) plus the obsolete v1 keys it deletes on sight',
};

/** Keys that exist only to be READ once and deleted: legacy inputs and obsolete caches. */
const legacyCompatibilityKeys = new Set([
  'questshelf.controllerLayout.v1',       // absorbed into questshelf.controllerSettings.v1 on read
  'questshelf.pendingUndoActions.v1',     // absorbed into .v2 on read, then removed
  'questshelf.personalRecommendations.v1', // obsolete recommendation cache, cleared on sight
  'questshelf.personalizedRecommendations.v1',
]);

function sourceFiles(directory = 'src'): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) && !path.endsWith('.typetest.ts') ? [path] : [];
  });
}

/** `const NAME = 'literal'` anywhere in src — so a key referenced through a constant still resolves. */
function constantLiterals(files: string[]): Map<string, string> {
  const literals = new Map<string, string>();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/(?:export\s+)?const\s+(\w+)\s*(?::\s*[\w<>[\]|' ]+)?=\s*'([^']+)'/g)) {
      literals.set(match[1], match[2]);
    }
  }
  return literals;
}

type DiscoveredKey = { file: string; expression: string; key: string | null; prefix: string | null };

function discoverStorageKeys(): DiscoveredKey[] {
  const files = sourceFiles();
  const literals = constantLiterals(files);
  const discovered: DiscoveredKey[] = [];

  for (const file of files) {
    if (keyAgnosticModules.has(file)) continue;

    for (const match of readFileSync(file, 'utf8').matchAll(storageCallPattern)) {
      const expression = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim();
      if (!expression) continue;

      const literal = /^'([^']+)'$/.exec(expression);
      if (literal) {
        discovered.push({ file, expression, key: literal[1], prefix: null });
        continue;
      }

      // A template literal: everything before the first interpolation is the family prefix.
      const template = /^`([^`$]*)\$\{/.exec(expression);
      if (template) {
        discovered.push({ file, expression, key: null, prefix: template[1] });
        continue;
      }

      const resolved = literals.get(expression);
      discovered.push({ file, expression, key: resolved ?? null, prefix: null });
    }
  }

  return discovered;
}

test('AS-18: every active Questory storage key is registered or an approved exception', () => {
  const discovered = discoverStorageKeys();
  assert.ok(discovered.length >= 20, 'the storage-call scan found suspiciously few call sites');

  const unregistered: string[] = [];

  for (const { file, expression, key, prefix } of discovered) {
    if (prefix !== null) {
      assert.ok(
        storageKeyFamilyRegistry.some((family) => family.prefix.startsWith(prefix) || prefix.startsWith(family.prefix)),
        `${file} builds keys with the prefix "${prefix}", which is not a registered family`,
      );
      continue;
    }

    if (key === null) {
      // The key could not be resolved statically — the file must say why.
      assert.ok(
        dynamicKeyCallSites[file],
        `${file} stores under a key this test cannot resolve ("${expression}"). Register the key/family, or document the call site.`,
      );
      continue;
    }

    if (legacyCompatibilityKeys.has(key)) continue;
    if (!isRegisteredStorageKey(key)) unregistered.push(`${key} (${file})`);
  }

  assert.deepEqual(
    unregistered,
    [],
    `these keys are written by the app but are in neither the registry nor a family:\n  ${unregistered.join('\n  ')}`,
  );
});

test('AS-18: the keys this PR registered are the ones that were previously invisible', () => {
  // A named list, so removing an entry from the registry cannot silently un-fix AS-18.
  for (const key of [
    'questshelf.controllerSettings.v1',
    'questshelf.neonButtonStyle.v1',
    'questshelf.hltbCache.v1',
    'questshelf.dailyQuest.sessions.v1',
    'questshelf.achievementQuiz.sessions.v1',
    'questshelf.questRunner.hs.v1',
    'questory.preRestoreSnapshot.v1',
  ]) {
    assert.ok(isRegisteredStorageKey(key), `${key} must stay registered`);
  }

  assert.ok(findStorageKeyFamily('questshelf.collectionViewMode.v1.library'), 'the view-mode family must cover its generated keys');
  assert.ok(findStorageKeyFamily('qs-sgdb-artwork:12345:hades'), 'the SteamGridDB artwork family must cover its generated keys');
});

// ════════════════════════════════════════════════════════════════════════════════════
// Registry validity
// ════════════════════════════════════════════════════════════════════════════════════

test('AS-18: keys are owned once, and families do not overlap', () => {
  const seen = new Set<string>();
  for (const descriptor of storageKeyRegistry) {
    assert.equal(seen.has(descriptor.key), false, `${descriptor.key} is registered twice`);
    seen.add(descriptor.key);
    assert.ok(descriptor.owner.length > 0, `${descriptor.key} has no owner`);
    assert.ok(descriptor.purpose.length > 0, `${descriptor.key} has no purpose`);
  }

  for (const family of storageKeyFamilyRegistry) {
    for (const other of storageKeyFamilyRegistry) {
      if (family === other) continue;
      assert.equal(family.prefix.startsWith(other.prefix), false, `family ${family.prefix} is swallowed by ${other.prefix}`);
    }

    // A family prefix must not also be claimed as a literal key.
    assert.equal(
      storageKeyRegistry.some((descriptor) => descriptor.key.startsWith(family.prefix)),
      false,
      `${family.prefix} collides with a literal key`,
    );
  }
});

test('AS-18: every entry carries a policy that makes sense for what it holds', () => {
  const store = (descriptor: StorageKeyDescriptor) => descriptor.store ?? 'kv';

  for (const descriptor of storageKeyRegistry) {
    // A secret is never in the default backup — it goes in only when the user opts in.
    if (descriptor.sensitive && descriptor.scope === 'integration') {
      assert.equal(descriptor.backup, 'optional', `${descriptor.key} is a credential and must be an OPTIONAL backup section`);
    }

    // Only the KV path can be hydrated from Preferences.
    if (descriptor.hydrateOnBoot) {
      assert.equal(store(descriptor), 'kv', `${descriptor.key} cannot be hydrated: it is not a KV value`);
    }

    // A session value is session-scoped in every direction.
    if (store(descriptor) === 'session') {
      assert.equal(descriptor.hydrateOnBoot, false, `${descriptor.key} is session state and must not be hydrated from Preferences`);
      assert.equal(descriptor.backup, 'never', `${descriptor.key} is session state and must not be backed up`);
    }

    // A disposable cache is not user data: it is never in a backup.
    if (descriptor.scope === 'cache') {
      assert.equal(descriptor.backup, 'never', `${descriptor.key} is a cache and must not be backed up`);
    }
  }
});

test('AS-18: hydration covers the KV values and nothing else', () => {
  for (const descriptor of storageKeyRegistry) {
    const shouldHydrate = persistentStorageKeys.includes(descriptor.key);
    assert.equal(shouldHydrate, descriptor.hydrateOnBoot, `${descriptor.key} hydration disagrees with its policy`);

    if ((descriptor.store ?? 'kv') !== 'kv') {
      assert.equal(shouldHydrate, false, `${descriptor.key} is ${descriptor.store} and must not be hydrated`);
    }
  }

  // The AS-18 defect, pinned: this value IS written to Preferences, and was never read back.
  assert.ok(persistentStorageKeys.includes('questshelf.controllerSettings.v1'), 'the controller settings must hydrate on native boot');
  assert.equal(persistentStorageKeys.includes('questshelf.pendingUndoActions.v2'), false, 'session undo state must not hydrate');
  assert.equal(persistentStorageKeys.includes('questshelf.games.v1'), false, 'the games collection must not round-trip through Preferences');
});

test('AS-18: recovery evidence and the device folder grant survive a reset', () => {
  assert.deepEqual(
    [...preservedStorageKeys].sort(),
    ['questory.preRestoreSnapshot.v1', 'questshelf.syncFolder.v1'],
    'a reset must not destroy the snapshot that makes a bad restore reversible, nor revoke a folder grant',
  );
});

// ════════════════════════════════════════════════════════════════════════════════════
// Reset behavior — the registry is what reset obeys
// ════════════════════════════════════════════════════════════════════════════════════

const { resetQuestShelfLocalData } = await import('../src/lib/backupStorage');
const { getStorageAdapter, setStorageAdapter } = await import('../src/lib/storageAdapter');
const { readAppCacheValue, writeAppCacheValue } = await import('../src/lib/indexedDbAppCache');
const { recoverySnapshotKey } = await import('../src/lib/recoverySnapshotStorage');

function installMemoryStorage(seed: Record<string, string>) {
  const store = new Map(Object.entries(seed));
  const previous = getStorageAdapter();
  setStorageAdapter({
    ...previous,
    readLocal: (key) => store.get(key) ?? null,
    writeLocal: (key, value) => { store.set(key, value); },
    removeLocal: (key) => { store.delete(key); },
    localKeys: () => [...store.keys()],
    readDurable: async (key) => store.get(key) ?? null,
    writeDurable: async (key, value) => { store.set(key, value); },
    removeDurable: async (key) => { store.delete(key); },
    hasDurableBackend: async () => true,
  });
  return { store, restore: () => setStorageAdapter(previous) };
}

test('AS-18: Reset removes every registered value, sweeps registered families, and touches nothing else', async () => {
  const storage = installMemoryStorage({
    // Core user data, a device setting, a cache and a hint — one from each family that used to be missed.
    'questshelf.platformQueues.v1': '{}',
    'questshelf.controllerSettings.v1': '{}',
    'questshelf.hltbCache.v1': '{}',
    'questshelf.dailyQuest.sessions.v1': '[]',
    'questshelf.questRunner.hs.v1': '4200',
    'questshelf.neonButtonStyle.v1': 'glow',
    'qs-queue-hint-v1': 'dismissed',
    'qs-hero-recent-eggs': '[]',
    // Generated families.
    'questshelf.collectionViewMode.v1.library': 'grid',
    'questshelf.collectionViewMode.v1.wishlist': 'compact',
    'qs-sgdb-artwork:12345:hades': '{}',
    // Not ours. A reset that removed these would be a bug in someone else's app.
    'another-app.session': 'keep me',
    'theme': 'dark',
  });

  window.sessionStorage.setItem('questshelf.pendingUndoActions.v2', '[]');
  await writeAppCacheValue(recoverySnapshotKey, { exportedAt: '2026-07-12T00:00:00.000Z', backup: { app: 'Questory' } });

  try {
    const summary = await resetQuestShelfLocalData();

    for (const key of ['questshelf.platformQueues.v1', 'questshelf.controllerSettings.v1', 'questshelf.hltbCache.v1', 'questshelf.dailyQuest.sessions.v1', 'questshelf.questRunner.hs.v1', 'questshelf.neonButtonStyle.v1', 'qs-queue-hint-v1', 'qs-hero-recent-eggs']) {
      assert.equal(storage.store.has(key), false, `${key} survived the reset`);
    }

    assert.equal(storage.store.has('questshelf.collectionViewMode.v1.library'), false, 'the generated view-mode keys are swept by their family');
    assert.equal(storage.store.has('questshelf.collectionViewMode.v1.wishlist'), false);
    assert.equal(storage.store.has('qs-sgdb-artwork:12345:hades'), false, 'the generated artwork cache is swept by its family');
    assert.deepEqual([...summary.removedGeneratedKeys].sort(), ['qs-sgdb-artwork:12345:hades', 'questshelf.collectionViewMode.v1.library', 'questshelf.collectionViewMode.v1.wishlist'].sort());

    assert.equal(storage.store.get('another-app.session'), 'keep me', 'a reset must not delete another origin/app key');
    assert.equal(storage.store.get('theme'), 'dark');

    assert.equal(window.sessionStorage.getItem('questshelf.pendingUndoActions.v2'), null, 'session undo state is cleared');

    // The one thing a reset must NOT destroy: the evidence that makes a bad restore reversible.
    assert.notEqual(await readAppCacheValue(recoverySnapshotKey), null, 'the pre-restore recovery snapshot must survive a reset');
    assert.deepEqual(summary.preservedKeys.sort(), ['questory.preRestoreSnapshot.v1', 'questshelf.syncFolder.v1']);
  } finally {
    storage.restore();
    window.sessionStorage.clear();
  }
});

// ════════════════════════════════════════════════════════════════════════════════════
// Backup selection comes from the registry, not from a second list
// ════════════════════════════════════════════════════════════════════════════════════

const { coreBackupStorageKeys, integrationBackupStorageKeys, deviceOnlyStorageKeys } = await import('../src/lib/storageRegistry');

test('AS-18: backup selection is derived from the registry, and credentials stay optional', () => {
  for (const descriptor of storageKeyRegistry) {
    const selection = descriptor.backup === 'default' ? coreBackupStorageKeys
      : descriptor.backup === 'optional' ? integrationBackupStorageKeys
        : deviceOnlyStorageKeys;
    assert.ok(selection.includes(descriptor.key), `${descriptor.key} is not in the selection its policy names`);
  }

  for (const key of ['questshelf.rawgSettings.v1', 'questshelf.steamSettings.v1', 'questshelf.steamGridDbSettings.v1', 'questshelf.isThereAnyDealSettings.v1']) {
    assert.ok(integrationBackupStorageKeys.includes(key as never), `${key} must remain an opt-in backup section`);
    assert.equal(coreBackupStorageKeys.includes(key as never), false, `${key} must never be in the default backup`);
  }

  // Disposable caches are not user data and are not exported — unchanged by this PR.
  for (const key of ['questshelf.screenshots.v1', 'questshelf.hltbCache.v1', 'questshelf.personalRecommendations.v2', 'questshelf.releaseCalendar.v2']) {
    assert.equal(coreBackupStorageKeys.includes(key as never), false, `${key} is a cache and must stay out of backups`);
  }
});
