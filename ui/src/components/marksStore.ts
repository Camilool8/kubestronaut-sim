// Per-question scratch state for the duration of one attempt: which
// questions the candidate has opened, and which they have flagged to come
// back to. Same module-singleton shape as toastStore and progressStore —
// no context, no provider.
//
// This is deliberately NOT attempt history. PRODUCT.md rules out history
// and cross-attempt analytics, and this obeys that: the state is scoped to
// one session's startedAt, lives in sessionStorage, and dies with the tab
// or the attempt. It survives a reload mid-exam, which is the only thing it
// is for — a candidate on question 17 of 22 needs to recall which of the
// first 16 they skipped, and today the UI cannot tell them.
//
// The two states are named for what the UI can actually observe. "viewed"
// means this tab rendered the question's text; it does not mean the work
// was done, and nothing here may ever be labelled "answered", "attempted"
// or "complete" — implying that would be the interface making a claim the
// grader has not checked.

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
  // useSyncExternalStore needs a snapshot with stable identity between
  // notifications. Two mutable Sets do not have that; a counter does.
  private version = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  /**
   * Point the store at one attempt. Called with session.startedAt, which
   * changes on every new attempt, so a fresh attempt starts clean without
   * anyone having to remember to clear.
   */
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

  /** Test-only: drop all state, including the scope. */
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

// sessionStorage throws rather than returning null when a browser has
// storage disabled entirely. Losing the marks is a downgrade the exam can
// absorb; throwing out of a click handler is not.
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
  } catch {
    // Ignored on purpose — see read().
  }
}

export const marksStore = new MarksStore();
