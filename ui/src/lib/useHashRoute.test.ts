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
    expect(parseRoute("#/exams/ckad/mode")).toEqual({
      path: "/exams/ckad/mode",
      segments: ["exams", "ckad", "mode"],
    });
  });

  // "" and not "/": a caller has to be able to tell "the fragment is
  // empty, use my default" apart from "the candidate asked for /".
  test("an empty fragment is an empty path, not a root path", () => {
    expect(parseRoute("")).toEqual({ path: "", segments: [] });
    expect(parseRoute("#")).toEqual({ path: "", segments: [] });
    expect(parseRoute("#/")).toEqual({ path: "", segments: [] });
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
