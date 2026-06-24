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
  define: {
    'import.meta.env.VITE_QS_ANALYTICS_ENABLED': JSON.stringify('false'),
    'import.meta.env.VITE_QS_ANALYTICS_WEBHOOK_URL': JSON.stringify('https://example.invalid/questshelf-analytics'),
    'import.meta.env.VITE_QS_ANALYTICS_KEY': JSON.stringify('replace-with-alpha-analytics-key'),
  },
  external: ['node:assert/strict', 'node:test'],
  logLevel: 'silent',
};

const testFiles = [
  { entry: 'scripts/analytics.test.ts', out: 'analytics.test.mjs' },
  { entry: 'scripts/retroTitleResolver.test.ts', out: 'retroTitleResolver.test.mjs' },
  { entry: 'scripts/settingsEntrypoints.test.ts', out: 'settingsEntrypoints.test.mjs' },
];

await Promise.all(
  testFiles.map(({ entry, out }) =>
    build({ ...sharedConfig, entryPoints: [entry], outfile: resolve(outdir, out) }),
  ),
);

for (const { out } of testFiles) {
  await import(pathToFileURL(resolve(outdir, out)).href);
}
