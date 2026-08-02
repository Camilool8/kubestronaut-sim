// The URL fragment as a route, and the two ways to change it.
//
// App's rule is that the visible screen is a pure function of
// session.state. That still holds — this is a view layer BENEATH it, not
// a replacement for it. The design brief puts more than one view inside
// a single session state (two screens before an attempt exists, a
// drill-down after one ends), and a refresh in the middle of those must
// not silently throw the candidate back to the first one.
//
// The fragment, rather than a path, for one reason: the facilitator
// serves the SPA itself and its "/" handler falls through to index.html,
// but /api/* and /desktop/* are real routes on the same origin. A
// path-based router would have to stay permanently aware of which
// prefixes are not its own. A fragment is never sent to the server at
// all, so the question cannot come up.
//
// react-router would bring a dependency, a provider and a matcher for
// this. Six routes do not need any of them.

import { useSyncExternalStore } from "react";

// Emitted by navigate(), because history.pushState/replaceState do NOT
// fire hashchange — only a user-driven fragment change does.
const ROUTE_EVENT = "kbs:route";

/** The current fragment, parsed. */
export interface Route {
  /**
   * Normalised: always a single leading slash, never a trailing one.
   * "" for the empty fragment, so a caller can tell "no route yet" from
   * "the root route" and pick its own default.
   */
  path: string;
  /** `path` split on "/", with empty segments dropped. */
  segments: string[];
  /**
   * Everything after a "?" in the fragment.
   *
   * Split off BEFORE `path` and `segments` are computed, so a screen that
   * takes a parameter cannot break the matching every other screen does:
   * "#/exams/ckad/mode?domain=a&domain=b" still has "mode" as its third
   * segment. Always present; empty when the fragment carries no query.
   *
   * A URLSearchParams rather than a flattened object, and the difference
   * is load-bearing: `getAll` is the only way to carry a LIST whose items
   * may themselves contain the separator. A curriculum domain is free text
   * a bank author writes, and CKAD really does ship one with a comma in it
   * ("Application Environment, Configuration and Security") — packed into
   * one comma-joined value, that name arrives as three domains the bank
   * does not have. Repeated keys have no such ambiguity, and each value
   * needs exactly one round of percent-encoding.
   *
   * This is for a preselection carried across a navigation — the weak
   * domains a drill starts from — not for state. It is in the URL rather
   * than a module store so a reload keeps it and the link can be shared.
   */
  query: URLSearchParams;
}

function subscribe(onChange: () => void): () => void {
  // Three sources: our own navigate(), the back/forward buttons, and a
  // fragment the user typed or a link that only changed the hash.
  window.addEventListener(ROUTE_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
  return () => {
    window.removeEventListener(ROUTE_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("hashchange", onChange);
  };
}

// useSyncExternalStore caches by identity, so this has to return the raw
// string and let parseRoute run in the hook body. Returning a fresh
// {path, segments} object here would compare unequal on every render and
// loop.
function readHash(): string {
  return window.location.hash;
}

// The server render (and the first paint of a prerendered page) has no
// location; "" is the same value an empty fragment produces, so both
// take the caller's default.
function readHashOnServer(): string {
  return "";
}

/**
 * Parse a raw `location.hash` into a Route. Exported for tests and for
 * callers that already hold a fragment string.
 */
export function parseRoute(hash: string): Route {
  // Strip the leading "#", then any leading "/" — "#/exams", "#exams"
  // and "#//exams/" all name the same route, and a hand-typed fragment
  // is the most likely source of the odd ones.
  const raw = hash.replace(/^#/, "");
  const cut = raw.indexOf("?");
  const pathPart = cut === -1 ? raw : raw.slice(0, cut);
  // URLSearchParams rather than a hand-rolled split: it is the same
  // decoder the browser uses, so a value carrying a "&", a "," or a space
  // round-trips through encodeURIComponent unharmed.
  const query = new URLSearchParams(cut === -1 ? "" : raw.slice(cut + 1));
  const segments = pathPart.split("/").filter((s) => s !== "");
  return { path: segments.length ? "/" + segments.join("/") : "", segments, query };
}

/**
 * Go to `path` (leading slash, e.g. "/exams/ckad/mode").
 *
 * `replace` swaps the current history entry instead of adding one. Use
 * it whenever the app is CORRECTING the route rather than responding to
 * the candidate — normalising an unknown fragment, or following a
 * session state change — so the Back button never lands on a route the
 * app will only bounce out of again.
 *
 * A module-level function, not a hook return, so effects and event
 * handlers can navigate without taking the hook as a dependency.
 */
export function navigate(path: string, { replace = false } = {}): void {
  const url = "#" + path;
  if (window.location.hash === url) return;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

/** The current route, re-rendering the caller whenever it changes. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, readHash, readHashOnServer);
  return parseRoute(hash);
}

/**
 * The current route plus navigate. Sugar over useRoute for components
 * that do both.
 *
 * `navigate` is returned as-is: it is a module-level function, so its
 * identity is already stable for the life of the app and wrapping it in
 * useCallback would only add a hook that guarantees nothing new.
 */
export function useHashRoute(): [Route, typeof navigate] {
  return [useRoute(), navigate];
}
