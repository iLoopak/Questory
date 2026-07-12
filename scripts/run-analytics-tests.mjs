import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outdir = resolve('.tmp/analytics-tests');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const sharedConfig = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  // React 19 uses the automatic runtime; the characterization tests render real
  // components/hooks, so .tsx sources must compile without a React import in scope.
  jsx: 'automatic',
  define: {
    'import.meta.env.DEV': JSON.stringify(false),
    'import.meta.env.PROD': JSON.stringify(false),
    'import.meta.env.VITE_INTEGRATIONS_PROXY_BASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_QS_ANALYTICS_ENABLED': JSON.stringify('false'),
    'import.meta.env.VITE_QS_ANALYTICS_ENDPOINT_URL': JSON.stringify('/api/telemetry'),
  },
  // Kept external so every test bundle shares ONE react/react-dom instance and one
  // jsdom/fake-indexeddb global environment, instead of each bundle carrying its own.
  external: [
    'node:assert/strict',
    'node:test',
    'node:fs',
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    'jsdom',
    'fake-indexeddb',
  ],
  logLevel: 'silent',
};

const testFiles = [
  { entry: 'scripts/analytics.test.ts', out: 'analytics.test.mjs' },
  { entry: 'scripts/retroTitleResolver.test.ts', out: 'retroTitleResolver.test.mjs' },
  { entry: 'scripts/settingsEntrypoints.test.ts', out: 'settingsEntrypoints.test.mjs' },
  { entry: 'scripts/backupStorage.test.ts', out: 'backupStorage.test.mjs' },
  { entry: 'scripts/reviewQueueOrder.test.ts', out: 'reviewQueueOrder.test.mjs' },
  { entry: 'scripts/discoveryInboxStorage.test.ts', out: 'discoveryInboxStorage.test.mjs' },
  { entry: 'scripts/multiGameImport.test.ts', out: 'multiGameImport.test.mjs' },
  { entry: 'scripts/recommendations.test.ts', out: 'recommendations.test.mjs' },
  { entry: 'scripts/discoveryPreviewArtwork.test.ts', out: 'discoveryPreviewArtwork.test.mjs' },
  { entry: 'scripts/titleMatching.test.ts', out: 'titleMatching.test.mjs' },
  { entry: 'scripts/tasteProfileUi.test.ts', out: 'tasteProfileUi.test.mjs' },
  // Characterization tests for the destructive/cross-store boundaries (ARCHITECTURE_STABILITY_AUDIT).
  { entry: 'scripts/gameIdentity.test.ts', out: 'gameIdentity.test.mjs' },
  { entry: 'scripts/kvPersistence.test.ts', out: 'kvPersistence.test.mjs' },
  { entry: 'scripts/retroPlanImport.test.ts', out: 'retroPlanImport.test.mjs' },
  { entry: 'scripts/backupRestoreDurability.test.ts', out: 'backupRestoreDurability.test.mjs' },
  // Its own bundle: a rejected IndexedDB write latches the repository into legacy-fallback for the
  // life of the module instance, which would quietly disable IndexedDB for every later test here.
  { entry: 'scripts/backupRestoreIdbRejection.test.ts', out: 'backupRestoreIdbRejection.test.mjs' },
  { entry: 'scripts/backupGameContracts.test.ts', out: 'backupGameContracts.test.mjs' },
  { entry: 'scripts/recoveryStateOwnership.test.ts', out: 'recoveryStateOwnership.test.mjs' },
  { entry: 'scripts/undoScopedOperations.test.ts', out: 'undoScopedOperations.test.mjs' },
  { entry: 'scripts/statusPlanInvariants.test.ts', out: 'statusPlanInvariants.test.mjs' },
  { entry: 'scripts/gameEditPatch.test.ts', out: 'gameEditPatch.test.mjs' },
  { entry: 'scripts/discoveryPromotion.test.ts', out: 'discoveryPromotion.test.mjs' },
  { entry: 'scripts/discoveryPromotionCommand.test.ts', out: 'discoveryPromotionCommand.test.mjs' },
  { entry: 'scripts/gameDetailDraft.test.ts', out: 'gameDetailDraft.test.mjs' },
];

await Promise.all(
  testFiles.map(({ entry, out }) =>
    build({ ...sharedConfig, entryPoints: [entry], outfile: resolve(outdir, out) }),
  ),
);

// jsdom + fake-indexeddb globals must exist before the first bundle is imported: each bundle
// eagerly evaluates its inlined dependencies, and Dexie snapshots `globalThis.indexedDB` at
// its own module init.
await import('./testUtils/installBrowserGlobals.mjs');

for (const { out } of testFiles) {
  await import(pathToFileURL(resolve(outdir, out)).href);
}
