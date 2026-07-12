/**
 * Client-side types, DERIVED from the canonical contract (AS-17). Nothing is declared twice: an
 * event name, a property key or an allowed value that is not in `telemetryContract.ts` does not
 * exist, and TypeScript says so at the call site.
 */
import {
  analyticsSchemaVersion,
  telemetryEnvelopeFields,
  telemetryEventRegistry,
  telemetryRuntimes,
  telemetrySensitiveFields,
} from './telemetryContract';

export { analyticsSchemaVersion, telemetryEnvelopeFields, telemetryEventRegistry, telemetryRuntimes, telemetrySensitiveFields };

export type TelemetryEventRegistry = typeof telemetryEventRegistry;
export type AnalyticsEventName = keyof TelemetryEventRegistry;
export const analyticsEventNames = Object.keys(telemetryEventRegistry) as AnalyticsEventName[];

/** Events with a live emitter. `reserved` events are accepted but nothing sends them yet. */
export type ActiveAnalyticsEventName = {
  [Name in AnalyticsEventName]: TelemetryEventRegistry[Name]['status'] extends 'active' ? Name : never;
}[AnalyticsEventName];

export const activeAnalyticsEventNames = analyticsEventNames.filter(
  (eventName) => telemetryEventRegistry[eventName].status === 'active',
) as ActiveAnalyticsEventName[];

export const reservedAnalyticsEventNames = analyticsEventNames.filter(
  (eventName) => telemetryEventRegistry[eventName].status === 'reserved',
);

export type AnalyticsSchemaVersion = typeof analyticsSchemaVersion;
export type AnalyticsRuntime = (typeof telemetryRuntimes)[number];
export type TelemetryPropertyValue = string | number | boolean;
export type TelemetryProperties = Record<string, TelemetryPropertyValue>;

type Enums<Name extends AnalyticsEventName> = TelemetryEventRegistry[Name] extends { enums: infer TEnums } ? TEnums : never;

/**
 * The value a property may carry: one of its declared enum strings, the schema version, or a
 * boolean. An exact count is not constructible — the privacy rule is enforced by the compiler rather
 * than by review.
 */
type PropertyValue<Name extends AnalyticsEventName, Key extends string> =
  Key extends keyof Enums<Name>
    ? Enums<Name>[Key] extends readonly (infer TValue)[] ? TValue : never
    : Key extends 'telemetry_schema_version' ? AnalyticsSchemaVersion : boolean;

type RequiredKeys<Name extends AnalyticsEventName> = TelemetryEventRegistry[Name]['required'][number] & string;
type OptionalKeys<Name extends AnalyticsEventName> = TelemetryEventRegistry[Name]['optional'][number] & string;

/** The exact payload one event accepts: required keys required, optional keys optional, nothing else. */
export type TelemetryPropertiesFor<Name extends AnalyticsEventName> =
  { [Key in RequiredKeys<Name>]: PropertyValue<Name, Key> }
  & { [Key in OptionalKeys<Name>]?: PropertyValue<Name, Key> };

export type MinimalAnalyticsEvent = {
  schemaVersion: AnalyticsSchemaVersion;
  eventName: AnalyticsEventName;
  eventId: string;
  timestamp: string;
  appVersion: string;
  runtime: AnalyticsRuntime;
  sessionId?: string;
} & TelemetryProperties;

export type AnalyticsCounts = { librarySize: number; wishlistSize: number; platformCount: number; playingCount: number; queueCount: number };
