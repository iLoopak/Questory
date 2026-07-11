import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outdir = resolve('.tmp/recommendation-calibration');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const entry = resolve(outdir, 'calibration-entry.ts');
await writeFile(entry, `
  import { recommendationBenchmarkProfiles } from '../../src/lib/recommendationBenchmarks';
  import { buildUserProfile } from '../../src/lib/userProfile';
  const summaries = recommendationBenchmarkProfiles.map((benchmark) => {
    const profile = buildUserProfile(benchmark.games);
    return {
      id: benchmark.id,
      games: benchmark.games.length,
      positiveGenres: profile.topGenres.length,
      positiveTags: profile.topTags.length,
      negativeSignals: profile.negativeGenres.length + profile.negativeTags.length + profile.negativeFranchises.length,
    };
  });
  console.log(JSON.stringify({ syntheticBenchmarks: summaries }, null, 2));
`);

const outfile = resolve(outdir, 'calibration-entry.mjs');
await build({
  bundle: true,
  entryPoints: [entry],
  format: 'esm',
  outfile,
  platform: 'node',
  define: {
    'import.meta.env.DEV': JSON.stringify(false),
    'import.meta.env.PROD': JSON.stringify(false),
  },
  logLevel: 'silent',
});

await import(pathToFileURL(outfile).href);

const privateBackup = resolve('.local-data/questory-backup.json');
if (existsSync(privateBackup)) {
  const parsed = JSON.parse(readFileSync(privateBackup, 'utf8'));
  const games = Array.isArray(parsed?.data?.['questshelf.games.v1']) ? parsed.data['questshelf.games.v1'] : [];
  console.log(JSON.stringify({
    privateBackup: {
      present: true,
      gameCount: games.length,
      libraryCount: games.filter((game) => game.collectionType !== 'wishlist').length,
      wishlistCount: games.filter((game) => game.collectionType === 'wishlist').length,
      ratedCount: games.filter((game) => typeof game.rating === 'number').length,
      droppedCount: games.filter((game) => game.status === 'Dropped').length,
    },
  }, null, 2));
} else {
  console.log(JSON.stringify({ privateBackup: { present: false } }, null, 2));
}
