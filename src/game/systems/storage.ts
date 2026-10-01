/** Minimal key-value storage, so game data can be tested without a browser. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** In-memory store for tests and as a fallback when localStorage is blocked. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}

/** localStorage wrapper that never throws (private mode, quota, disabled storage). */
export function browserStore(): KeyValueStore {
  try {
    const probe = '__zs_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
  } catch {
    return memoryStore();
  }
  return {
    get: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Storage full or blocked: keep playing without saving.
      }
    },
    remove: (key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore: nothing to clean up.
      }
    },
  };
}

/** Reads JSON and returns null when it is missing, broken, or rejected by `parse`. */
export function readJson<T>(store: KeyValueStore, key: string, parse: (raw: unknown) => T | null): T | null {
  const text = store.get(key);
  if (text === null) return null;
  try {
    return parse(JSON.parse(text));
  } catch {
    return null;
  }
}

export function writeJson(store: KeyValueStore, key: string, value: unknown): void {
  store.set(key, JSON.stringify(value));
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A finite number, or `fallback`. */
export const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** A non-negative whole number, or `fallback`. */
export const count = (v: unknown, fallback = 0): number => Math.max(0, Math.floor(num(v, fallback)));
