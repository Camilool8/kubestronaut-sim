import { useSyncExternalStore } from "react";

const ROUTE_EVENT = "kbs:route";

export interface Route {
  path: string;

  segments: string[];

  query: URLSearchParams;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(ROUTE_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
  return () => {
    window.removeEventListener(ROUTE_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("hashchange", onChange);
  };
}

function readHash(): string {
  return window.location.hash;
}

function readHashOnServer(): string {
  return "";
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  const cut = raw.indexOf("?");
  const pathPart = cut === -1 ? raw : raw.slice(0, cut);

  const query = new URLSearchParams(cut === -1 ? "" : raw.slice(cut + 1));
  const segments = pathPart.split("/").filter((s) => s !== "");
  return { path: segments.length ? "/" + segments.join("/") : "", segments, query };
}

export function navigate(path: string, { replace = false } = {}): void {
  const url = "#" + path;
  if (window.location.hash === url) return;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, readHash, readHashOnServer);
  return parseRoute(hash);
}

export function useHashRoute(): [Route, typeof navigate] {
  return [useRoute(), navigate];
}
