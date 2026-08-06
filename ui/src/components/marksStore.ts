const KEY_PREFIX = "sim.marks.";

interface Persisted {
  viewed: string[];
  marked: string[];
}

class MarksStore {
  private storageKey: string | null = null;
  private viewed = new Set<string>();
  private marked = new Set<string>();
  private listeners = new Set<() => void>();

  private version = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  setScope(scope: string): void {
    const key = KEY_PREFIX + scope;
    if (key === this.storageKey) return;
    this.storageKey = key;
    this.viewed = new Set();
    this.marked = new Set();
    const raw = read(key);
    if (raw) {
      for (const id of raw.viewed) this.viewed.add(id);
      for (const id of raw.marked) this.marked.add(id);
    }
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

function read(key: string): Persisted | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      viewed: Array.isArray(parsed.viewed) ? parsed.viewed : [],
      marked: Array.isArray(parsed.marked) ? parsed.marked : [],
    };
  } catch {
    return null;
  }
}

function write(key: string, value: Persisted): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const marksStore = new MarksStore();
