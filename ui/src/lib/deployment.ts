import { useSyncExternalStore } from "react";

let hosted = false;
const listeners = new Set<() => void>();

export function setHostedDeployment(next: boolean): void {
  if (hosted === next) return;
  hosted = next;
  for (const listener of listeners) listener();
}

export function isHostedDeployment(): boolean {
  return hosted;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHostedDeployment(): boolean {
  return useSyncExternalStore(subscribe, isHostedDeployment, isHostedDeployment);
}
