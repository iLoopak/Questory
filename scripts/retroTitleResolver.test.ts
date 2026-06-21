import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRetroTitle } from '../src/lib/retroTitleResolver';

// Helper: assert that `expected` appears in `actual` in the same relative order
// (not necessarily contiguous, just as a subsequence)
function assertSubsequence(actual: string[], expected: string[], label: string) {
  let ei = 0;
  for (const item of actual) {
    if (ei < expected.length && item === expected[ei]) ei++;
  }
  assert.equal(
    ei,
    expected.length,
    `${label}: expected subsequence [${expected.join(', ')}] not found in [${actual.join(', ')}]`,
  );
}

test('Super Mario World (USA) [!].sfc — plain title', () => {
  const result = resolveRetroTitle({
    romFileName: 'Super Mario World (USA) [!].sfc',
    currentTitle: 'Super Mario World',
  });
  assert.equal(result.candidateTitles[0], 'Super Mario World');
  assert.equal(result.cleanedTitle, 'Super Mario World');
  assert.ok(!result.candidateTitles.some((c) => c.includes('(USA)')), 'should strip region tag');
  assert.ok(!result.candidateTitles.some((c) => c.includes('[!')), 'should strip dump tag');
});

test('Zelda, The - A Link to the Past (Europe) (Rev 1).smc — comma-reorder + franchise expansion', () => {
  const result = resolveRetroTitle({
    romFileName: 'Zelda, The - A Link to the Past (Europe) (Rev 1).smc',
    currentTitle: 'Zelda, The A Link to the Past',
  });

  // Franchise-expanded form must be the first candidate
  assert.equal(result.candidateTitles[0], 'The Legend of Zelda: A Link to the Past');

  // Must contain these key candidates in this relative order
  assertSubsequence(result.candidateTitles, [
    'The Legend of Zelda: A Link to the Past',
    'The Zelda A Link to the Past',
    'Zelda A Link to the Past',
  ], 'Zelda ALTTP candidates');

  assert.ok(!result.candidateTitles.some((c) => c.includes('(Europe)')), 'should strip region tag');
  assert.ok(!result.candidateTitles.some((c) => c.includes('Rev 1')), 'should strip revision tag');
});

test('Legend of Zelda, The - The Minish Cap (USA).gba — comma-reorder', () => {
  const result = resolveRetroTitle({
    romFileName: 'Legend of Zelda, The - The Minish Cap (USA).gba',
    currentTitle: 'Legend of Zelda, The The Minish Cap',
  });

  // Reordered title with colon must be first candidate (no franchise expansion since "Legend of Zelda" is already full)
  assert.equal(result.candidateTitles[0], 'The Legend of Zelda: The Minish Cap');
  assert.equal(result.cleanedTitle, 'The Legend of Zelda: The Minish Cap');

  assertSubsequence(result.candidateTitles, [
    'The Legend of Zelda: The Minish Cap',
    'Legend of Zelda The Minish Cap',
  ], 'Minish Cap candidates');

  assert.ok(!result.candidateTitles.some((c) => c.includes('(USA)')), 'should strip region tag');
});

test('Pokemon - FireRed Version (USA).gba — subtitle separator + version strip', () => {
  const result = resolveRetroTitle({
    romFileName: 'Pokemon - FireRed Version (USA).gba',
    currentTitle: 'Pokemon FireRed Version',
  });

  // "Version"-stripped form must appear before the full form
  assertSubsequence(result.candidateTitles, [
    'Pokemon FireRed',
    'Pokemon FireRed Version',
  ], 'Pokemon FireRed candidates');

  assert.ok(result.candidateTitles.includes('Pokemon FireRed'), 'must include stripped form');
  assert.ok(result.candidateTitles.includes('Pokemon FireRed Version'), 'must include full form');
  assert.ok(!result.candidateTitles.some((c) => c.includes('(USA)')), 'should strip region tag');
});

test('Final Fantasy VI Advance (Europe).gba — plain title, exact candidate first', () => {
  const result = resolveRetroTitle({
    romFileName: 'Final Fantasy VI Advance (Europe).gba',
    currentTitle: 'Final Fantasy VI Advance',
  });

  assert.equal(result.candidateTitles[0], 'Final Fantasy VI Advance');
  assert.equal(result.cleanedTitle, 'Final Fantasy VI Advance');
  assert.ok(!result.candidateTitles.some((c) => c.includes('(Europe)')), 'should strip region tag');
});

test('Metroid - Zero Mission (USA).gba — subtitle separator', () => {
  const result = resolveRetroTitle({
    romFileName: 'Metroid - Zero Mission (USA).gba',
    currentTitle: 'Metroid Zero Mission',
  });

  assert.ok(result.candidateTitles.includes('Metroid Zero Mission'), 'joined form present');
  assert.ok(result.candidateTitles.includes('Metroid: Zero Mission'), 'colon form present');
  assert.ok(result.candidateTitles.includes('Metroid'), 'fallback form present');
  assert.equal(result.candidateTitles[0], 'Metroid Zero Mission', 'joined form is first');
  assert.equal(result.cleanedTitle, 'Metroid: Zero Mission');
  assert.ok(!result.candidateTitles.some((c) => c.includes('(USA)')), 'should strip region tag');
});

test('Castlevania - Aria of Sorrow (USA).gba — subtitle separator', () => {
  const result = resolveRetroTitle({
    romFileName: 'Castlevania - Aria of Sorrow (USA).gba',
    currentTitle: 'Castlevania Aria of Sorrow',
  });

  assert.ok(result.candidateTitles.includes('Castlevania Aria of Sorrow'), 'joined form present');
  assert.ok(result.candidateTitles.includes('Castlevania: Aria of Sorrow'), 'colon form present');
  assert.ok(result.candidateTitles.includes('Castlevania'), 'fallback form present');
  assert.equal(result.candidateTitles[0], 'Castlevania Aria of Sorrow', 'joined form is first');
  assert.ok(!result.candidateTitles.some((c) => c.includes('(USA)')), 'should strip region tag');
});

test('metadataSearchTitle is always first when set', () => {
  const result = resolveRetroTitle({
    romFileName: 'Zelda, The - A Link to the Past (USA).smc',
    currentTitle: 'Zelda, The A Link to the Past',
    metadataSearchTitle: 'A Link to the Past',
  });

  assert.equal(result.candidateTitles[0], 'A Link to the Past');
});

test('no romFileName falls back to currentTitle', () => {
  const result = resolveRetroTitle({ currentTitle: 'Some Game' });
  assert.ok(result.candidateTitles.includes('Some Game'));
  assert.equal(result.cleanedTitle, 'Some Game');
});

test('noise removal: underscores, multiple spaces', () => {
  const result = resolveRetroTitle({
    romFileName: 'Super_Mario_Bros__NES_.nes',
    currentTitle: 'Super Mario Bros',
  });
  assert.ok(!result.candidateTitles.some((c) => c.includes('_')), 'underscores should be removed');
});
