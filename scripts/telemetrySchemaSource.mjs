/**
 * Renders the server telemetry schema from the canonical contract (AS-17).
 *
 * Shared by the generator (`npm run generate:telemetry-schema`) and by the test that asserts the
 * checked-in `api/telemetry-schema.js` still matches the contract — so the two lists cannot drift
 * apart again without a red test.
 */

const banner = `// GENERATED FILE — do not edit by hand.
//
// Source of truth: src/lib/analytics/telemetryContract.ts
// Regenerate:      npm run generate:telemetry-schema
//
// AS-17: the client registry and this allowlist used to be maintained separately and had drifted —
// live recommendation and Discovery events were rejected in production as INVALID_EVENT_NAME while
// every test passed. There is one contract now, and this file is its server projection.
`;

/** A JS literal for a value that is only ever a string, number, boolean or array of those. */
function literal(value) {
  return JSON.stringify(value);
}

function renderEvent(name, schema) {
  const enums = schema.enums ?? {};
  const enumSource = Object.keys(enums).length === 0
    ? '{}'
    : `{ ${Object.entries(enums).map(([key, values]) => `${key}: ${literal(values)}`).join(', ')} }`;

  return `  ${name}: { status: ${literal(schema.status)}, required: ${literal(schema.required ?? [])}, optional: ${literal(schema.optional ?? [])}, enums: ${enumSource} },`;
}

export function buildTelemetrySchemaSource({ analyticsSchemaVersion, telemetryEnvelopeFields, telemetrySensitiveFields, telemetryRuntimes, telemetryEventRegistry }) {
  const events = Object.entries(telemetryEventRegistry).map(([name, schema]) => renderEvent(name, schema)).join('\n');

  return `${banner}
export const analyticsSchemaVersion = ${literal(analyticsSchemaVersion)};
export const telemetryEnvelopeFields = ${literal([...telemetryEnvelopeFields])};
export const telemetrySensitiveFields = ${literal([...telemetrySensitiveFields])};
export const telemetryRuntimes = ${literal([...telemetryRuntimes])};

export const telemetryEventRegistry = {
${events}
};
`;
}
