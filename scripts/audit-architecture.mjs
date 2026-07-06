import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const srcDir = join(root, 'src');
const threshold = Number(process.env.ARCH_AUDIT_LINE_THRESHOLD ?? 500);
const topCount = Number(process.env.ARCH_AUDIT_TOP_COUNT ?? 20);
const extensions = new Set(['.ts', '.tsx']);
const ignoredDirs = new Set(['node_modules', 'dist', 'build', '.git']);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, files);
    } else if (extensions.has(extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineCount(path) {
  const contents = readFileSync(path, 'utf8');
  if (contents.length === 0) return 0;
  return contents.split(/\r?\n/).length;
}

const files = walk(srcDir)
  .map((path) => ({ path: relative(root, path), lines: lineCount(path) }))
  .sort((a, b) => b.lines - a.lines);

const oversized = files.filter((file) => file.lines >= threshold);
const cardLike = files.filter((file) => /(^|\/)(.*Card|GameCard.*|.*Preview.*)\.tsx$/.test(file.path));

console.log('Questory architecture drift report');
console.log('===================================');
console.log(`Line-count threshold: ${threshold}`);
console.log('');

console.log(`Files at or above threshold (${oversized.length}):`);
if (oversized.length === 0) {
  console.log('  None');
} else {
  for (const file of oversized) {
    console.log(`  ${String(file.lines).padStart(5)}  ${file.path}`);
  }
}

console.log('');
console.log(`Top ${Math.min(topCount, files.length)} largest TS/TSX files:`);
for (const file of files.slice(0, topCount)) {
  console.log(`  ${String(file.lines).padStart(5)}  ${file.path}`);
}

console.log('');
console.log('Card/preview-like component inventory:');
if (cardLike.length === 0) {
  console.log('  None');
} else {
  for (const file of cardLike) {
    console.log(`  ${String(file.lines).padStart(5)}  ${file.path}`);
  }
}

console.log('');
console.log('Advisory only: this script reports drift and always exits successfully.');
