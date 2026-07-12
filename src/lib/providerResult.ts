// AS-10: a provider failure is not an empty result.
//
// Several RAWG helpers used to `catch { return []; }`. Downstream, `[]` is a perfectly valid answer
// ("RAWG knows of no upcoming Metroidvanias for you"), so a 401, a 429, a timeout or an offline
// device became "no recommendations" — and the services then CACHED that emptiness, in one case for
// 24 hours. The outage was indistinguishable from a genuine no-results response, the UI hid the
// section, and there was nothing to retry.
//
// Everything that talks to a provider now returns a `ProviderResult`: a success (possibly with zero
// items) or a typed failure. Only successes may be cached; a failure falls back to the last good
// data and says so.

export type ProviderErrorKind =
  /** No API key is configured. A setup problem, not an outage. */
  | 'missing-key'
  /** The provider rejected the key (401/403). Also setup — retrying will not help. */
  | 'invalid-key'
  | 'rate-limited'
  | 'timeout'
  /** The request never reached the provider (offline, DNS, CORS…). */
  | 'network'
  /** The provider answered, but with an error (5xx, or an unclassified failure). */
  | 'provider'
  /** The provider answered 200 with something we cannot read. Retrying rarely helps, but it may. */
  | 'malformed-response'
  /** We cancelled it ourselves — not an outage, and never worth surfacing as one. */
  | 'aborted';

export type ProviderError = {
  kind: ProviderErrorKind;
  /** Whether trying again in a moment could plausibly succeed. Setup errors are not retryable. */
  retryable: boolean;
  status?: number;
  retryAfterMs?: number;
  /**
   * Copy that is safe to show and to log: no API key, no request URL, no provider payload. Every
   * message here is written by us, never taken from a provider response.
   */
  safeMessage: string;
};

/** Where the data came from. `stale-cache` means "the refresh failed, this is the last good data". */
export type ProviderResultSource = 'network' | 'cache' | 'stale-cache';

export type ProviderResult<T> =
  | { ok: true; data: T; source: ProviderResultSource }
  | { ok: false; error: ProviderError; staleData?: T };

const retryableKinds: ReadonlySet<ProviderErrorKind> = new Set<ProviderErrorKind>([
  'rate-limited',
  'timeout',
  'network',
  'provider',
  'malformed-response',
]);

const safeMessages: Record<ProviderErrorKind, string> = {
  'missing-key': 'Add a RAWG API key in Settings → Integrations to load this.',
  'invalid-key': 'RAWG did not accept this API key. Check it in Settings → Integrations.',
  'rate-limited': 'RAWG is rate limiting requests right now. Try again in a moment.',
  timeout: 'RAWG took too long to respond. Try again.',
  network: 'Could not reach RAWG. Check your connection and try again.',
  provider: 'RAWG is having trouble right now. Try again shortly.',
  'malformed-response': 'RAWG returned a response Questory could not read.',
  aborted: 'The request was cancelled.',
};

export function isRetryableProviderErrorKind(kind: ProviderErrorKind): boolean {
  return retryableKinds.has(kind);
}

/** True for the two states the user has to FIX rather than wait out. */
export function isProviderSetupErrorKind(kind: ProviderErrorKind): boolean {
  return kind === 'missing-key' || kind === 'invalid-key';
}

export function createProviderError(
  kind: ProviderErrorKind,
  options: { status?: number; retryAfterMs?: number; safeMessage?: string } = {},
): ProviderError {
  return {
    kind,
    retryable: isRetryableProviderErrorKind(kind),
    ...(options.status !== undefined ? { status: options.status } : {}),
    ...(options.retryAfterMs !== undefined ? { retryAfterMs: options.retryAfterMs } : {}),
    safeMessage: options.safeMessage ?? safeMessages[kind],
  };
}

export function providerSuccess<T>(data: T, source: ProviderResultSource = 'network'): ProviderResult<T> {
  return { ok: true, data, source };
}

export function providerFailure<T>(error: ProviderError, staleData?: T): ProviderResult<T> {
  return staleData === undefined ? { ok: false, error } : { ok: false, error, staleData };
}

/**
 * The one place a caught exception becomes a taxonomy entry.
 *
 * `AbortError` is our own cancellation; a `TypeError` from `fetch` means the request never left the
 * device; a JSON `SyntaxError` means the body was unreadable. Anything else is charged to the
 * provider rather than silently dropped.
 */
export function toProviderErrorKind(error: unknown): ProviderErrorKind {
  if (error instanceof DOMException && error.name === 'AbortError') return 'aborted';
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'aborted';
    if (error.name === 'TimeoutError') return 'timeout';
    if (error.name === 'SyntaxError') return 'malformed-response';
    if (error.name === 'TypeError') return 'network';
  }
  return 'provider';
}

/** Read a `Retry-After` header (seconds, or an HTTP date) as milliseconds. */
export function parseRetryAfterMs(headerValue: string | null | undefined, now = Date.now()): number | undefined {
  const value = headerValue?.trim();
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const date = Date.parse(value);
  return Number.isFinite(date) && date > now ? date - now : undefined;
}

/**
 * How several provider calls in one operation add up.
 *
 * `ok` — everything that ran, ran (a stage returning zero items is still ok).
 * `partial` — something failed, but usable data came back from elsewhere.
 * `failed` — every provider call failed, so we know nothing. This is the state that must never be
 * cached and must never be reported as an empty success.
 */
export type ProviderStatus = 'ok' | 'partial' | 'failed';

export type ProviderStatusSummary = {
  status: ProviderStatus;
  successCount: number;
  failureCount: number;
  /** The data being shown was last fetched successfully some time ago; the refresh failed. */
  stale: boolean;
  /** The first failure, for the message and the Retry affordance. */
  error?: ProviderError;
};

export function summarizeProviderStatus(
  successCount: number,
  failureCount: number,
  options: { stale?: boolean; error?: ProviderError } = {},
): ProviderStatusSummary {
  const status: ProviderStatus =
    failureCount === 0 ? 'ok' : successCount === 0 ? 'failed' : 'partial';

  return {
    status,
    successCount,
    failureCount,
    stale: options.stale ?? false,
    ...(options.error && status !== 'ok' ? { error: options.error } : {}),
  };
}

/** Diagnostics/telemetry label. Safe by construction: a category, never a payload. */
export function getProviderErrorCategory(kind: ProviderErrorKind): 'authentication' | 'network' | 'provider_unavailable' | 'parsing' | 'unknown' {
  if (kind === 'missing-key' || kind === 'invalid-key') return 'authentication';
  if (kind === 'network' || kind === 'timeout') return 'network';
  if (kind === 'rate-limited' || kind === 'provider') return 'provider_unavailable';
  if (kind === 'malformed-response') return 'parsing';
  return 'unknown';
}
