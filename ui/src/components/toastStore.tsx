export type ToastKind = "info" | "warning";

export interface ToastInput {
  kind: ToastKind;
  message: string;

  dedupeKey?: string;
}

export interface Toast extends ToastInput {
  id: number;
}

const INFO_TTL_MS = 5_000;

class ToastStore {
  private toasts: Toast[] = [];
  private listeners = new Set<() => void>();
  private seq = 0;
  private timers = new Map<number, number>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  list = (): Toast[] => this.toasts;

  push(input: ToastInput): number {
    if (input.dedupeKey) {
      const existing = this.toasts.find((t) => t.dedupeKey === input.dedupeKey);
      if (existing) this.remove(existing.id);
    }
    const toast: Toast = { ...input, id: ++this.seq };
    this.toasts = [...this.toasts, toast];
    if (toast.kind === "info") {
      const timer = window.setTimeout(() => this.remove(toast.id), INFO_TTL_MS);
      this.timers.set(toast.id, timer);
    }
    this.notify();
    return toast.id;
  }

  dismiss(id: number): void {
    this.remove(id);
  }

  clear(): void {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.toasts = [];
    this.notify();
  }

  private remove(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.timers.delete(id);
    }
    const next = this.toasts.filter((t) => t.id !== id);
    if (next.length !== this.toasts.length) {
      this.toasts = next;
      this.notify();
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const toastStore = new ToastStore();
