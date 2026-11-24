const KEY_PREFIX = "sim.marks.";

interface Persisted {
  viewed: string[];
  marked: string[];
}

export class MarksStore {
  private storageKey: string | null = null;
  private viewed = new Set<string>();
  private marked = new Set<string>();
  private listeners = new Set<() => void>();
  private watching = false;

  private version = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  setScope(scope: string): void {
    if (!scope) {
      if (this.storageKey !== null) this.reset();
      return;
    }
    const key = KEY_PREFIX + scope;
    if (key === this.storageKey) return;
    this.storageKey = key;
    this.load(read(key));
    dropOtherAttempts(key);
    this.watch();
    this.notify();
  }

  isViewed = (id: string): boolean => this.viewed.has(id);

  isMarked = (id: string): boolean => this.marked.has(id);

  markViewed(id: string): void {
    if (this.viewed.has(id)) return;
    this.viewed.add(id);
    this.persist();
    this.notify();
  }

  toggleMark(id: string): void {
    if (this.marked.has(id)) this.marked.delete(id);
    else this.marked.add(id);
    this.persist();
    this.notify();
  }

  reset(): void {
    this.storageKey = null;
    this.viewed = new Set();
    this.marked = new Set();
    this.notify();
  }

  private load(raw: Persisted | null): void {
    this.viewed = new Set(raw?.viewed ?? []);
    this.marked = new Set(raw?.marked ?? []);
  }

  private watch(): void {
    if (this.watching || typeof window === "undefined") return;
    this.watching = true;
    window.addEventListener("storage", this.onStorage);
  }

  private onStorage = (event: StorageEvent): void => {
    if (!this.storageKey || event.key !== this.storageKey) return;
    this.load(parse(event.newValue));
    this.notify();
  };

  private persist(): void {
    if (!this.storageKey) return;
    write(this.storageKey, {
      viewed: [...this.viewed],
      marked: [...this.marked],
    });
  }

  private notify(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

function parse(raw: string | null): Persisted | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      viewed: Array.isArray(parsed.viewed) ? parsed.viewed : [],
      marked: Array.isArray(parsed.marked) ? parsed.marked : [],
    };
  } catch {
    return null;
  }
}

function read(key: string): Persisted | null {
  try {
    const stored = parse(window.localStorage.getItem(key));
    if (stored) return stored;
  } catch {}
  try {
    return parse(window.sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key: string, value: Persisted): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function dropOtherAttempts(keep: string): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(KEY_PREFIX) && key !== keep) stale.push(key);
    }
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {}
}

export const marksStore = new MarksStore();
