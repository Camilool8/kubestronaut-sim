import { useSyncExternalStore } from "react";

const STORAGE_KEY = "sim.singleKeyShortcuts";

function readPref(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

class SingleKeyShortcuts {
  private on = readPref();
  private listeners = new Set<() => void>();

  get enabled(): boolean {
    return this.on;
  }

  setEnabled(next: boolean): void {
    this.on = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {}
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): boolean => this.on;

  reset(): void {
    this.on = readPref();
    for (const l of this.listeners) l();
  }
}

export const singleKeyShortcuts = new SingleKeyShortcuts();

export function useSingleKeyShortcuts(): boolean {
  return useSyncExternalStore(
    singleKeyShortcuts.subscribe,
    singleKeyShortcuts.getSnapshot,
    singleKeyShortcuts.getSnapshot,
  );
}
