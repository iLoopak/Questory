/**
 * Generates api/telemetry-schema.js from src/lib/analytics/telemetryContract.ts (AS-17).
 *
 * The contract is TypeScript (the client needs its literal types); the serverless function is plain
 * ESM JavaScript, as the Vercel deployment model requires. Rather than maintain both by hand — which
 * is exactly how the two drifted — the server file is generated from the contract and a test fails
 * if the checked-in copy is stale.
 */
import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildTelemetrySchemaSource } from './telemetrySchemaSource.mjs';

const outputPath = 'api/telemetry-schema.js';

export async function loadTelemetryContract() {
  const directory = await mkdtemp(join(tmpdir(), 'questory-telemetry-'));
  const bundlePath = join(directory, 'contract.mjs');

  try {
    await build({
      entryPoints: ['src/lib/analytics/telemetryContract.ts'],
      outfile: bundlePath,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      logLevel: 'silent',
    });

    return await import(pathToFileURL(bundlePath).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const contract = await loadTelemetryContract();
const source = buildTelemetrySchemaSource(contract);
const current = await readFile(outputPath, 'utf8').catch(() => null);

if (current === source) {
  console.log(`${outputPath} is already up to date.`);
} else {
  await writeFile(outputPath, source, 'utf8');
  console.log(`${outputPath} regenerated from the telemetry contract.`);
}
