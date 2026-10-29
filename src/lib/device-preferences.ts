// Only non-record appearance preferences belong in browser storage.
type Preference = 'cf-theme' | 'cf-accent' | 'cf-sidebar';

export function readPreference(key: Preference): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: Preference, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Restricted browsers can still change appearance for the current session.
  }
}
