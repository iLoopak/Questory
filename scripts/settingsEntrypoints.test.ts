import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appController = readFileSync('src/features/app/AppController.tsx', 'utf8');
const shelfProfilePopover = readFileSync('src/features/shelf-profile/ShelfProfilePopover.tsx', 'utf8');
const settingsView = readFileSync('src/features/settings/SettingsView.tsx', 'utf8');
const appNavigation = readFileSync('src/hooks/useAppNavigation.ts', 'utf8');

function extractFunctionBody(source: string, functionName: string): string {
  const signature = `function ${functionName}(`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const braceStart = source.indexOf('{', start);
  assert.notEqual(braceStart, -1, `${functionName} should have a body`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(braceStart + 1, index);
  }

  assert.fail(`${functionName} body should close`);
}

test('generic Settings entrypoints open the Settings overview instead of Personalization', () => {
  const controllerShortcutBody = extractFunctionBody(appController, 'openSettingsFromShelfProfile');

  assert.match(controllerShortcutBody, /setActiveNavItem\('Settings'\)/, 'logo popover Settings should navigate to Settings');
  assert.match(controllerShortcutBody, /setActiveSettingsCategory\(null\)/, 'logo popover Settings should clear any selected section');
  assert.doesNotMatch(controllerShortcutBody, /setActiveSettingsCategory\('Personalization'\)/, 'logo popover Settings must not deep-link to Personalization');
  assert.doesNotMatch(shelfProfilePopover, /onOpenPersonalization/, 'logo popover generic Settings action should not be wired as Personalization');

  assert.match(appController, /useControllerAction\('openMenu',[\s\S]*?setActiveNavItem\('Settings'\)[\s\S]*?setActiveSettingsCategory\(null\)/, 'handheld/controller menu Settings shortcut should open the overview');
  assert.match(appNavigation, /useState<SettingsCategory \| null>\(null\)/, 'main Settings navigation starts without a selected section');
  assert.match(settingsView, /activeCategoryMeta \? \([\s\S]*?\) : \(\s*<SettingsOverview onSelect=\{selectCategory\} \/>/, 'Settings overview should render when no category is selected');

  assert.doesNotMatch(appController, /defaultSettingsSection\s*=\s*['"]Personalization['"]|defaultSettingsSection\s*=\s*['"]personalization['"]|setActiveSettingsCategory\('personalization'\)|setActiveSettingsCategory\('appearance'\)/, 'generic Settings entrypoints should not use legacy hardcoded lowercase section targets');
});
