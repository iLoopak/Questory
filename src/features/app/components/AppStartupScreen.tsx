import { createTranslator } from '../../../i18n';
import { loadLanguagePreference } from '../../../lib/languagePreference';
import { QuestShelfLogo } from './QuestShelfLogo';

export function AppStartupScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-4 text-slate-100">
      <div className="qs-glass w-full max-w-md rounded-lg border p-5 shadow-panel">
        <div className="flex items-center gap-3">
          <QuestShelfLogo className="h-12 w-12 rounded-lg border border-mint/30" fallbackClassName="text-sm" />
          <div>
            <div className="text-sm font-semibold uppercase tracking-spread text-mint">Questory</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">{createTranslator(loadLanguagePreference())('common.loadingLibrary')}</h1>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-full animate-pulse rounded bg-white/10" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </main>
  );
}
