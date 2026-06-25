import { useState } from 'react';
import { getIntegrationDiagnostics, getIntegrationEnvironmentLabel, getIntegrationProxyBaseUrl, getIntegrationProxyRequestUrl, getIntegrationTransport, postIntegration, summarizeIntegrationResponse, type IntegrationProvider } from '../lib/integrationProxy';
import { loadIsThereAnyDealSettings } from '../lib/isThereAnyDealSettingsStorage';
import { loadRawgSettings } from '../lib/rawgSettingsStorage';
import { loadSteamGridDbSettings } from '../lib/steamGridDbSettingsStorage';
import { loadSteamSettings } from '../lib/steamSettingsStorage';
import { SettingsSection } from './settings/SettingsSection';

type TestState = {
  errorDetails?: string;
  finalUrl: string;
  httpStatus?: number | null;
  responseSummary?: string;
  status: 'idle' | 'testing' | 'success' | 'error';
  transport: ReturnType<typeof getIntegrationTransport>;
};

const providers: IntegrationProvider[] = ['Steam', 'RAWG', 'SteamGridDB', 'ITAD'];

export function IntegrationDiagnosticsPanel() {
  const [results, setResults] = useState<Record<IntegrationProvider, TestState>>(() => Object.fromEntries(providers.map((provider) => [provider, createInitialState(provider)])) as Record<IntegrationProvider, TestState>);
  const [logVersion, setLogVersion] = useState(0);
  const environment = getIntegrationEnvironmentLabel();

  async function runTest(provider: IntegrationProvider) {
    const test = getProviderTest(provider);
    setResults((current) => ({ ...current, [provider]: { ...createInitialState(provider), status: 'testing', finalUrl: test.url } }));
    try {
      const payload = await postIntegration<unknown>(test.providerSlug, test.route, test.body);
      const latest = getIntegrationDiagnostics().find((entry) => entry.provider === provider && entry.requestUrl === test.url);
      setResults((current) => ({
        ...current,
        [provider]: {
          finalUrl: test.url,
          httpStatus: latest?.httpStatus ?? 200,
          responseSummary: latest?.responseSummary ?? summarizeIntegrationResponse(payload),
          status: 'success',
          transport: getIntegrationTransport(test.providerSlug),
        },
      }));
    } catch (error) {
      const latest = getIntegrationDiagnostics().find((entry) => entry.provider === provider && entry.requestUrl === test.url);
      setResults((current) => ({
        ...current,
        [provider]: {
          errorDetails: error instanceof Error ? error.message : String(error),
          finalUrl: test.url,
          httpStatus: latest?.httpStatus ?? (typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : null),
          responseSummary: latest?.responseSummary,
          status: 'error',
          transport: getIntegrationTransport(test.providerSlug),
        },
      }));
    } finally {
      setLogVersion((value) => value + 1);
    }
  }

  return (
    <SettingsSection title="Integration Diagnostics" description="Audit production Android transport. Production and APK builds should use the Vercel integration proxy, never direct provider APIs.">
      <div className="grid gap-2 rounded-md border border-skyglass/15 bg-ink-950/70 p-3 text-xs text-slate-300 sm:grid-cols-2">
        <DiagnosticField label="Environment" value={environment} />
        <DiagnosticField label="Resolved proxy URL" value={getIntegrationProxyBaseUrl()} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {providers.map((provider) => {
          const result = results[provider];
          return (
            <article key={provider} className="rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-white">{provider}</h3>
                <button className="h-9 rounded-md border border-mint/30 px-3 text-sm font-semibold text-mint transition hover:bg-mint/10 disabled:opacity-50" disabled={result.status === 'testing'} onClick={() => void runTest(provider)} type="button">
                  {result.status === 'testing' ? 'Testing…' : 'Test connection'}
                </button>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <DiagnosticField label="Active transport" value={result.transport} />
                <DiagnosticField label="Final URL" value={result.finalUrl} />
                <DiagnosticField label="HTTP status" value={result.httpStatus == null ? 'Not tested' : String(result.httpStatus)} />
                <DiagnosticField label="Response summary" value={result.responseSummary || 'Not tested'} />
                <DiagnosticField label="Error details" value={result.errorDetails || 'None'} />
              </div>
            </article>
          );
        })}
      </div>
      <details className="rounded-md border border-skyglass/15 bg-ink-950/70 p-3 text-xs text-slate-300">
        <summary className="cursor-pointer font-semibold text-white">Recent integration request log</summary>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] text-slate-400">{JSON.stringify({ logVersion, entries: getIntegrationDiagnostics() }, null, 2)}</pre>
      </details>
    </SettingsSection>
  );
}

function createInitialState(provider: IntegrationProvider): TestState {
  const test = getProviderTest(provider);
  return { finalUrl: test.url, status: 'idle', transport: getIntegrationTransport(test.providerSlug) };
}

function getProviderTest(provider: IntegrationProvider) {
  if (provider === 'Steam') {
    const settings = loadSteamSettings();
    return { providerSlug: 'steam', route: 'owned-games', url: getIntegrationProxyRequestUrl('steam', 'owned-games'), body: { apiKey: settings.apiKey.trim(), steamId64: settings.steamId64 } };
  }
  if (provider === 'RAWG') {
    const settings = loadRawgSettings();
    return { providerSlug: 'rawg', route: 'request', url: getIntegrationProxyRequestUrl('rawg', 'request'), body: { apiKey: settings.apiKey.trim(), route: '/games', params: { search: 'Portal', page_size: '1' } } };
  }
  if (provider === 'SteamGridDB') {
    const settings = loadSteamGridDbSettings();
    return { providerSlug: 'steamgriddb', route: 'artwork', url: getIntegrationProxyRequestUrl('steamgriddb', 'artwork'), body: { apiKey: settings.apiKey.trim(), steamAppId: 400, title: 'Portal', test: true } };
  }
  const settings = loadIsThereAnyDealSettings();
  return { providerSlug: 'itad', route: 'search', url: getIntegrationProxyRequestUrl('itad', 'search'), body: { apiKey: settings.apiKey.trim(), title: 'Portal', results: '1' } };
}

function DiagnosticField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-white/10 bg-ink-900/70 p-2">
      <div className="qs-label-caps text-slate-500">{label}</div>
      <div className="mt-1 break-words font-mono text-slate-200">{value}</div>
    </div>
  );
}
