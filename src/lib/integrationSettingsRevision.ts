let revision = 0;
const listeners = new Set<() => void>();

export function getIntegrationSettingsRevision() { return revision; }
export function subscribeIntegrationSettings(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function notifyIntegrationSettingsChanged() { revision += 1; listeners.forEach((listener) => listener()); }
export function resetIntegrationSettingsRevision() { revision = 0; }
