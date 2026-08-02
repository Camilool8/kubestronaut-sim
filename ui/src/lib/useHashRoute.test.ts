import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { navigate, parseRoute, useHashRoute, useRoute } from "./useHashRoute";

beforeEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
});

afterEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
});

describe("parseRoute", () => {
  test("splits a normal route into segments", () => {
    const route = parseRoute("#/exams/ckad/mode");
    expect(route.path).toBe("/exams/ckad/mode");
    expect(route.segments).toEqual(["exams", "ckad", "mode"]);
    expect([...route.query]).toEqual([]);
  });

  // "" and not "/": a caller has to be able to tell "the fragment is
  // empty, use my default" apart from "the candidate asked for /".
  test.each(["", "#", "#/"])(
    "%s is an empty path, not a root path",
    (hash) => {
      const route = parseRoute(hash);
      expect(route.path).toBe("");
      expect(route.segments).toEqual([]);
    },
  );

  // The point of splitting the query off FIRST: every screen matches on
  // segments, and a parameter on the last one must not change what that
  // segment is.
  test("a query does not leak into the last segment", () => {
    const route = parseRoute("#/exams/ckad/mode?domain=Services");
    expect(route.path).toBe("/exams/ckad/mode");
    expect(route.segments).toEqual(["exams", "ckad", "mode"]);
    expect(route.query.get("domain")).toBe("Services");
  });

  // The reason `query` is a URLSearchParams and not a flat object. CKAD
  // ships a domain with a comma in its name; packed into one comma-joined
  // value it would come back as three domains that do not exist.
  test("a repeated key carries a list whose items may contain a comma", () => {
    const names = ["Application Environment, Configuration and Security", "Services & Networking"];
    const params = new URLSearchParams();
    for (const name of names) params.append("domain", name);
    const { query } = parseRoute(`#/exams/ckad/mode?${params.toString()}`);
    expect(query.getAll("domain")).toEqual(names);
  });

  test("an empty query carries no keys", () => {
    expect([...parseRoute("#/progress?").query]).toEqual([]);
  });

  // A hand-typed fragment is where the odd shapes come from.
  test.each(["#exams", "#/exams", "#//exams", "#/exams/", "#/exams//"])(
    "%s normalises to /exams",
    (hash) => {
      expect(parseRoute(hash).path).toBe("/exams");
    },
  );
});

describe("useRoute", () => {
  test("reads the fragment already in the URL at mount", () => {
    window.history.replaceState(null, "", "#/results");
    const { result } = renderHook(() => useRoute());
    expect(result.current.path).toBe("/results");
  });

  // pushState does not fire hashchange, so without the module's own
  // event the hook would never see a navigate() at all.
  test("re-renders when navigate pushes a route", () => {
    const { result } = renderHook(() => useRoute());
    act(() => navigate("/progress"));
    expect(result.current.path).toBe("/progress");
    expect(result.current.segments).toEqual(["progress"]);
  });

  test("re-renders on a user-driven fragment change", () => {
    const { result } = renderHook(() => useRoute());
    act(() => {
      window.history.pushState(null, "", "#/exams");
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(result.current.path).toBe("/exams");
  });

  test("stops listening once unmounted", () => {
    const { result, unmount } = renderHook(() => useRoute());
    unmount();
    act(() => navigate("/progress"));
    expect(result.current.path).toBe("");
  });
});

describe("navigate", () => {
  test("push adds a history entry per route, so Back has somewhere to go", () => {
    const before = window.history.length;
    act(() => navigate("/exams"));
    act(() => navigate("/progress"));
    expect(window.history.length).toBe(before + 2);
  });

  // Back/forward do not go through navigate() at all — the browser
  // changes the URL and fires popstate — so the subscription is the only
  // thing that can keep the rendered screen in step with the address bar.
  test("re-renders on popstate", () => {
    const { result } = renderHook(() => useRoute());
    act(() => navigate("/progress"));
    expect(result.current.path).toBe("/progress");

    act(() => {
      window.history.replaceState(null, "", "#/exams");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.path).toBe("/exams");
  });

  // The reason replace exists: a route the app is CORRECTING must not
  // become a Back target, or Back lands somewhere the app immediately
  // bounces out of again.
  test("replace does not add a history entry", () => {
    const before = window.history.length;
    act(() => navigate("/exams", { replace: true }));
    expect(window.location.hash).toBe("#/exams");
    expect(window.history.length).toBe(before);
  });

  test("navigating to the route already showing is a no-op", () => {
    act(() => navigate("/exams"));
    const before = window.history.length;
    act(() => navigate("/exams"));
    expect(window.history.length).toBe(before);
  });
});

describe("useHashRoute", () => {
  test("returns the route and a navigate that keeps its identity", () => {
    const { result, rerender } = renderHook(() => useHashRoute());
    const [, go] = result.current;
    rerender();
    expect(result.current[1]).toBe(go);

    act(() => go("/results/q04"));
    expect(result.current[0].segments).toEqual(["results", "q04"]);
  });
});
