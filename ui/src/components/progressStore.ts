const SHOW_DELAY_MS = 200;
const MIN_VISIBLE_MS = 300;

class ProgressStore {
  private inFlight = 0;
  private visible = false;
  private listeners = new Set<() => void>();
  private showTimer: number | null = null;
  private hideTimer: number | null = null;
  private shownAt = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  isVisible = (): boolean => this.visible;

  start(): void {
    this.inFlight++;
    if (this.inFlight !== 1) return;
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
      return;
    }
    if (this.visible || this.showTimer !== null) return;
    this.showTimer = window.setTimeout(() => {
      this.showTimer = null;
      this.visible = true;
      this.shownAt = Date.now();
      this.notify();
    }, SHOW_DELAY_MS);
  }

  done(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (this.inFlight > 0) return;
    if (this.showTimer !== null) {
      window.clearTimeout(this.showTimer);
      this.showTimer = null;
      return;
    }
    if (!this.visible || this.hideTimer !== null) return;
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - this.shownAt));
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      this.visible = false;
      this.notify();
    }, remaining);
  }

  reset(): void {
    if (this.showTimer !== null) window.clearTimeout(this.showTimer);
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.showTimer = null;
    this.hideTimer = null;
    this.inFlight = 0;
    this.visible = false;
    this.shownAt = 0;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const progressStore = new ProgressStore();
