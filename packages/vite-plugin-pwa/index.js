const virtualRegisterId = 'virtual:pwa-register';
const resolvedVirtualRegisterId = `\0${virtualRegisterId}`;

export function VitePWA(options = {}) {
  const manifest = options.manifest ?? null;
  const manifestFilename = options.filename ?? 'manifest.webmanifest';

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
    generateBundle() {
      if (!manifest) {
        return;
      }

      this.emitFile({
        type: 'asset',
        fileName: manifestFilename,
        source: `${JSON.stringify(manifest, null, 2)}\n`,
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
