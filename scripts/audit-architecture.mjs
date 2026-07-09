import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const root = process.cwd();
const srcDir = join(root, 'src');
const threshold = numberFromEnv('ARCH_AUDIT_LINE_THRESHOLD', 500);
const topCount = numberFromEnv('ARCH_AUDIT_TOP_COUNT', 20);
const importThreshold = numberFromEnv('ARCH_AUDIT_IMPORT_THRESHOLD', 35);
const domainThreshold = numberFromEnv('ARCH_AUDIT_DOMAIN_THRESHOLD', 6);
const propThreshold = numberFromEnv('ARCH_AUDIT_PROP_THRESHOLD', 30);
const callbackPropThreshold = numberFromEnv('ARCH_AUDIT_CALLBACK_PROP_THRESHOLD', 20);
const hookReturnThreshold = numberFromEnv('ARCH_AUDIT_HOOK_RETURN_THRESHOLD', 15);
const extensions = new Set(['.ts', '.tsx']);
const ignoredDirs = new Set(['node_modules', 'dist', 'build', '.git']);
const internalAreas = new Set([
  'components',
  'features',
  'hooks',
  'lib',
  'services',
  'types',
  'config',
  'utils',
  'domain',
]);
const callbackPrefixes = [
  'on',
  'set',
  'handle',
  'sync',
  'refresh',
  'import',
  'update',
  'remove',
  'add',
  'open',
  'close',
  'move',
  'play',
  'finish',
  'drop',
  'restore',
];
const hotspots = [
  'src/features/app/AppController.tsx',
  'src/features/app/AppSectionRouter.tsx',
  'src/features/app/useAppSyncActions.ts',
];

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toPosix(path) {
  return path.split(sep).join('/');
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
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

function readFile(path) {
  return readFileSync(path, 'utf8');
}

function lineCount(contents) {
  if (contents.length === 0) return 0;
  return contents.split(/\r?\n/).length;
}

function staticImports(contents) {
  return [...contents.matchAll(/^\s*import\s+(?!\()(?:(?:type\s+)?[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]\s*;?/gm)].map(
    (match) => match[1],
  );
}

function internalAreaForSpecifier(specifier) {
  const normalized = specifier.replace(/\\/g, '/');
  if (normalized.startsWith('@/')) {
    const area = normalized.split('/')[1];
    return internalAreas.has(area) ? area : null;
  }
  if (normalized.startsWith('./') || normalized.startsWith('../')) {
    const srcIndex = normalized.split('/').indexOf('src');
    if (srcIndex >= 0) {
      const area = normalized.split('/')[srcIndex + 1];
      return internalAreas.has(area) ? area : null;
    }
  }
  return null;
}

function internalAreasForFile(filePath, imports) {
  const areas = new Set();
  const fromPath = filePath.split('/');
  for (const specifier of imports) {
    let area = internalAreaForSpecifier(specifier);
    if (!area && (specifier.startsWith('./') || specifier.startsWith('../'))) {
      // Resolve relative imports textually enough to identify the first folder under src.
      const base = fromPath.slice(0, -1);
      const parts = [...base, ...specifier.replace(/\\/g, '/').split('/')];
      const resolved = [];
      for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') resolved.pop();
        else resolved.push(part);
      }
      const srcIndex = resolved.indexOf('src');
      area = srcIndex >= 0 ? resolved[srcIndex + 1] : null;
    }
    if (internalAreas.has(area)) areas.add(area);
  }
  return [...areas].sort();
}

function findMatchingBrace(contents, openIndex) {
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < contents.length; i += 1) {
    const char = contents[i];
    const prev = contents[i - 1];
    if (quote) {
      if (char === quote && prev !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelFields(body) {
  const fields = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    const prev = body[i - 1];
    if (quote) {
      if (char === quote && prev !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if ('{[<('.includes(char)) depth += 1;
    else if ('}]>)'.includes(char)) depth = Math.max(0, depth - 1);
    else if ((char === ';' || char === ',') && depth === 0) {
      const field = body.slice(start, i).trim();
      if (field) fields.push(field);
      start = i + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail) fields.push(tail);
  return fields.filter((field) => !field.startsWith('//') && !field.startsWith('/*'));
}

function propName(field) {
  const match = field.match(/^(?:readonly\s+)?['"]?([A-Za-z_$][\w$]*)['"]?\??\s*[:(]/);
  return match?.[1] ?? null;
}

function isCallbackProp(name) {
  return callbackPrefixes.some((prefix) => name === prefix || name.startsWith(prefix[0].toUpperCase() + prefix.slice(1)) || name.startsWith(prefix));
}

function propTypes(contents, filePath) {
  if (!filePath.endsWith('.tsx')) return [];
  const results = [];
  const pattern = /(?:export\s+)?(?:type|interface)\s+([A-Za-z_$][\w$]*Props)\b[^={]*[={]/g;
  for (const match of contents.matchAll(pattern)) {
    const openIndex = contents.indexOf('{', match.index);
    if (openIndex < 0) continue;
    const closeIndex = findMatchingBrace(contents, openIndex);
    if (closeIndex < 0) continue;
    const fields = splitTopLevelFields(contents.slice(openIndex + 1, closeIndex));
    const names = fields.map(propName).filter(Boolean);
    const callbackCount = names.filter(isCallbackProp).length;
    results.push({ filePath, name: match[1], count: names.length, callbackCount });
  }
  return results;
}

function hookReturns(contents, filePath) {
  const results = [];
  const hookPattern = /export\s+function\s+(use[A-Z][\w$]*)\s*\([^)]*\)\s*{/g;
  for (const hook of contents.matchAll(hookPattern)) {
    const openIndex = contents.indexOf('{', hook.index);
    const closeIndex = findMatchingBrace(contents, openIndex);
    if (closeIndex < 0) continue;
    const body = contents.slice(openIndex + 1, closeIndex);
    // Deliberately conservative: only count direct object literal returns in exported hook bodies.
    for (const ret of body.matchAll(/return\s*{\s*([\s\S]*?)\s*};?/g)) {
      const fields = splitTopLevelFields(ret[1]);
      const names = fields
        .map((field) => field.match(/^([A-Za-z_$][\w$]*)\b/)?.[1] ?? null)
        .filter(Boolean);
      if (names.length > 0) results.push({ filePath, name: hook[1], count: names.length });
    }
  }
  return results;
}

function printRows(rows, emptyText = 'None') {
  if (rows.length === 0) {
    console.log(`  ${emptyText}`);
    return;
  }
  for (const row of rows) console.log(row);
}

const files = walk(srcDir)
  .map((absolutePath) => {
    const contents = readFile(absolutePath);
    const path = toPosix(relative(root, absolutePath));
    const imports = staticImports(contents);
    const areas = internalAreasForFile(path, imports);
    const props = propTypes(contents, path);
    return {
      absolutePath,
      path,
      contents,
      lines: lineCount(contents),
      importCount: imports.length,
      areas,
      props,
      hookReturns: hookReturns(contents, path),
    };
  })
  .sort((a, b) => b.lines - a.lines);

const oversized = files.filter((file) => file.lines >= threshold);
const cardLike = files.filter((file) => /(^|\/)(.*Card|GameCard.*|.*Preview.*)\.tsx$/.test(file.path));
const allProps = files.flatMap((file) => file.props).sort((a, b) => b.count - a.count);
const allHookReturns = files.flatMap((file) => file.hookReturns).sort((a, b) => b.count - a.count);
const importPressure = [...files].sort((a, b) => b.importCount - a.importCount);
const crossDomain = files.filter((file) => file.areas.length > 0).sort((a, b) => b.areas.length - a.areas.length || b.importCount - a.importCount);

console.log('Questory architecture drift report');
console.log('===================================');
console.log('Advisory only: thresholds identify files worth reviewing and never fail CI.');
console.log(`Line-count threshold: ${threshold}`);
console.log('');

console.log(`Files at or above threshold (${oversized.length}):`);
printRows(oversized.map((file) => `  ${String(file.lines).padStart(5)}  ${file.path}`));

console.log('');
console.log(`Top ${Math.min(topCount, files.length)} largest TS/TSX files:`);
printRows(files.slice(0, topCount).map((file) => `  ${String(file.lines).padStart(5)}  ${file.path}`));

console.log('');
console.log('Card/preview-like component inventory:');
printRows(cardLike.map((file) => `  ${String(file.lines).padStart(5)}  ${file.path}`));

console.log('');
console.log(`Import pressure report (threshold: ${importThreshold} imports):`);
printRows(importPressure.slice(0, topCount).map((file) => {
  const flag = file.importCount >= importThreshold ? '  REVIEW' : '        ';
  return `${flag}  ${String(file.importCount).padStart(3)} imports  ${file.path}`;
}));

console.log('');
console.log(`Cross-domain import report (threshold: ${domainThreshold} areas):`);
printRows(crossDomain.slice(0, topCount).map((file) => {
  const flag = file.areas.length >= domainThreshold ? '  REVIEW' : '        ';
  return `${flag}  ${String(file.areas.length).padStart(2)} areas  ${file.path}  [${file.areas.join(', ')}]`;
}));

console.log('');
console.log(`Prop surface report (threshold: ${propThreshold} props):`);
printRows(allProps.slice(0, topCount).map((prop) => {
  const flag = prop.count >= propThreshold ? '  REVIEW' : '        ';
  return `${flag}  ${String(prop.count).padStart(3)} props  ${prop.name}  ${prop.filePath}`;
}));

console.log('');
console.log(`Callback prop pressure report (threshold: ${callbackPropThreshold} callback/action props):`);
printRows([...allProps].sort((a, b) => b.callbackCount - a.callbackCount).slice(0, topCount).map((prop) => {
  const flag = prop.callbackCount >= callbackPropThreshold ? '  REVIEW' : '        ';
  return `${flag}  ${String(prop.callbackCount).padStart(3)} callbacks  ${prop.name}  ${prop.filePath}`;
}));

console.log('');
console.log(`Hook return pressure report (threshold: ${hookReturnThreshold} returned keys):`);
printRows(allHookReturns.slice(0, topCount).map((hook) => {
  const flag = hook.count >= hookReturnThreshold ? '  REVIEW' : '        ';
  return `${flag}  ${String(hook.count).padStart(3)} keys  ${hook.name}  ${hook.filePath}`;
}));

console.log('');
console.log('Known architecture hotspot report:');
const hotspotRows = hotspots.flatMap((hotspot) => {
  const file = files.find((entry) => entry.path === hotspot);
  if (!file) return [];
  const largestProp = [...file.props].sort((a, b) => b.count - a.count)[0];
  const propSummary = largestProp ? `${largestProp.name}: ${largestProp.count} props` : 'no local prop type found';
  return [`  ${file.path}\n        lines: ${file.lines}, imports: ${file.importCount}, areas: ${file.areas.length} [${file.areas.join(', ') || 'none'}], largest prop: ${propSummary}`];
});
printRows(hotspotRows);

console.log('');
console.log('Advisory only: this script reports architecture drift, exits successfully, and should not block regular development.');
