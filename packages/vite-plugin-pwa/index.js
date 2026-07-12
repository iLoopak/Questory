import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrecacheManifest, renderServiceWorker } from './precache.js';

const virtualRegisterId = 'virtual:pwa-register';
const resolvedVirtualRegisterId = `\0${virtualRegisterId}`;

const pluginDirectory = dirname(fileURLToPath(import.meta.url));

export function VitePWA(options = {}) {
  const manifest = options.manifest ?? null;
  const manifestFilename = options.filename ?? 'manifest.webmanifest';
  const publicDirectory = options.publicDir ?? 'public';

  return {
    name: 'vite-plugin-pwa',
    enforce: 'post',
    resolveId(id) {
      if (id === virtualRegisterId) {
        return resolvedVirtualRegisterId;
      }
    },
    load(id) {
      if (id === resolvedVirtualRegisterId) {
        return createRegisterModule(options.registerType ?? 'prompt');
      }
    },
    configureServer(server) {
      serveManifest(server.middlewares, manifestFilename, manifest);
    },
    configurePreviewServer(server) {
      serveManifest(server.middlewares, manifestFilename, manifest);
    },
    generateBundle(_outputOptions, bundle) {
      if (manifest) {
        this.emitFile({
          type: 'asset',
          fileName: manifestFilename,
          source: `${JSON.stringify(manifest, null, 2)}\n`,
        });
      }

      // AS-11: the worker's precache is derived from the ACTUAL build output — every hashed bundle,
      // every lazy route chunk, the CSS, index.html — plus the shell's public assets. It is no longer
      // a hand-written list that silently omitted everything the app needs to run.
      const publicFiles = listPublicFiles(publicDirectory);
      const bundleFiles = Object.keys(bundle);
      if (manifest) publicFiles.push(manifestFilename);

      const precache = buildPrecacheManifest({ bundleFiles, publicFiles });
      const template = readFileSync(resolve(pluginDirectory, 'sw-template.js'), 'utf8');

      this.emitFile({ type: 'asset', fileName: 'sw.js', source: renderServiceWorker(template, precache) });
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: `${JSON.stringify(precache, null, 2)}\n`,
      });
    },
  };
}

function createRegisterModule(registerType) {
  return `
const registerType = ${JSON.stringify(registerType)};

export function registerSW(options = {}) {
  const immediate = Boolean(options.immediate);
  const onRegistered = typeof options.onRegistered === 'function' ? options.onRegistered : undefined;
  const onRegisterError = typeof options.onRegisterError === 'function' ? options.onRegisterError : undefined;
  const onNeedRefresh = typeof options.onNeedRefresh === 'function' ? options.onNeedRefresh : undefined;
  const onOfflineReady = typeof options.onOfflineReady === 'function' ? options.onOfflineReady : undefined;

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    return () => undefined;
  }

  let registration;

  const register = () => {
    navigator.serviceWorker.register('/sw.js')
      .then((nextRegistration) => {
        registration = nextRegistration;
        onRegistered?.(nextRegistration);

        if (registerType === 'autoUpdate') {
          nextRegistration.update().catch(() => undefined);
          window.setInterval(() => {
            nextRegistration.update().catch(() => undefined);
          }, 60 * 60 * 1000);
        }

        nextRegistration.addEventListener('updatefound', () => {
          const installingWorker = nextRegistration.installing;
          if (!installingWorker) {
            return;
          }

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state !== 'installed') {
              return;
            }

            if (navigator.serviceWorker.controller) {
              onNeedRefresh?.();
              if (registerType === 'autoUpdate') {
                installingWorker.postMessage({ type: 'SKIP_WAITING' });
              }
              return;
            }

            onOfflineReady?.();
          });
        });
      })
      .catch((error) => {
        onRegisterError?.(error);
      });
  };

  if (immediate) {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }

  return (reloadPage = true) => {
    if (reloadPage) {
      window.location.reload();
    }
  };
}
`;
}

function serveManifest(middlewares, manifestFilename, manifest) {
  if (!manifest) {
    return;
  }

  const manifestPath = `/${manifestFilename}`;
  middlewares.use(manifestPath, (_request, response) => {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    response.end(`${JSON.stringify(manifest, null, 2)}\n`);
  });
}


/** Everything Vite copies verbatim out of `public/`, as paths relative to it. */
function listPublicFiles(publicDirectory) {
  const root = resolve(publicDirectory);

  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory);
    } catch {
      return [];
    }

    return entries.flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory() ? walk(path) : [relative(root, path)];
    });
  };

  return walk(root);
}
