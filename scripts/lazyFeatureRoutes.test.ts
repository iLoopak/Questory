import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PanelLoadingFallback } from '../src/components/PanelLoadingFallback';
import { isChunkLoadError } from '../src/components/RootErrorBoundary';
import { renderComponent } from './testUtils/reactHarness';

const routerSource = readFileSync('src/features/app/AppSectionRouter.tsx', 'utf8');
const capacitorConfig = readFileSync('capacitor.config.ts', 'utf8');
const viteConfig = readFileSync('vite.config.ts', 'utf8');

const lazyRoutes = [
  ['ArtworkRoute', 'src/features/app/routes/ArtworkRoute.tsx'],
  ['DiscoveryInboxRoute', 'src/features/app/routes/DiscoveryInboxRoute.tsx'],
  ['DiscoveryRoute', 'src/features/app/routes/DiscoveryRoute.tsx'],
  ['QuestQueueRoute', 'src/features/app/routes/QuestQueueRoute.tsx'],
  ['ReviewModeRoute', 'src/features/app/routes/ReviewModeRoute.tsx'],
  ['TasteProfileRoute', 'src/features/app/routes/TasteProfileRoute.tsx'],
] as const;

test('rare feature routes use one explicit lazy boundary while startup routes stay eager', () => {
  for (const [routeName] of lazyRoutes) {
    assert.match(routerSource, new RegExp(`const ${routeName} = lazy\\(\\(\\) => import\\(`));
    assert.doesNotMatch(routerSource, new RegExp(`import \\{ ${routeName} \\} from`));
  }
  for (const routeName of ['HomeRoute', 'LibraryRoute', 'WishlistRoute']) {
    assert.match(routerSource, new RegExp(`import \\{ ${routeName} \\} from`));
  }
  assert.equal((routerSource.match(/<Suspense fallback=/g) ?? []).length, 1);
});

test('every lazy route target exports exactly one reusable route component', () => {
  for (const [routeName, path] of lazyRoutes) {
    const routeSource = readFileSync(path, 'utf8');
    assert.match(routeSource, new RegExp(`export function ${routeName}\\(`));
    assert.equal((routerSource.match(new RegExp(`import\\('./routes/${routeName}'\\)`, 'g')) ?? []).length, 1);
  }
});

test('route loading fallback is accessible, stable and reduced-motion aware', async () => {
  const handle = await renderComponent(PanelLoadingFallback, {});
  const status = document.querySelector('[role="status"]');
  assert.equal(status?.getAttribute('aria-busy'), 'true');
  assert.match(status?.textContent ?? '', /Loading section/);
  assert.match(status?.innerHTML ?? '', /min-h-\[60vh\]/);
  assert.match(status?.innerHTML ?? '', /motion-safe:animate-pulse/);
  await handle.unmount();
});

test('lazy chunks retain update recovery, PWA precaching and Capacitor packaging contracts', () => {
  assert.equal(isChunkLoadError(new Error('Failed to fetch dynamically imported module')), true);
  assert.match(viteConfig, /globPatterns:\s*\['\*\*\/\*\.\{js,css,html,ico,png,svg,webmanifest\}'\]/);
  assert.match(capacitorConfig, /webDir:\s*'dist'/);
});
