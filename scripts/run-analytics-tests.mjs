import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outdir = resolve('.tmp/analytics-tests');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const outfile = resolve(outdir, 'analytics.test.mjs');
await build({
  entryPoints: ['scripts/analytics.test.ts'],
  outfile,
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
});
await import(pathToFileURL(outfile).href);
