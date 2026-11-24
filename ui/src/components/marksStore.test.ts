import { afterEach, describe, expect, test } from "vitest";
import { MarksStore } from "./marksStore";

const ATTEMPT = "2026-11-23T09:00:00Z";
const NEXT_ATTEMPT = "2026-11-23T14:30:00Z";

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("marksStore across tabs", () => {
  test("flags and opened tasks survive reopening the exam in a new tab", () => {
    const first = new MarksStore();
    first.setScope(ATTEMPT);
    first.markViewed("q01");
    first.markViewed("q02");
    first.toggleMark("q02");

    window.sessionStorage.clear();
    const reopened = new MarksStore();
    reopened.setScope(ATTEMPT);

    expect(reopened.isViewed("q01")).toBe(true);
    expect(reopened.isViewed("q02")).toBe(true);
    expect(reopened.isMarked("q02")).toBe(true);
    expect(reopened.isViewed("q03")).toBe(false);
  });

  test("a new attempt starts clean and drops the previous attempt's record", () => {
    const first = new MarksStore();
    first.setScope(ATTEMPT);
    first.toggleMark("q01");

    const later = new MarksStore();
    later.setScope(NEXT_ATTEMPT);
    later.markViewed("q05");

    expect(later.isMarked("q01")).toBe(false);
    const keys = Array.from({ length: window.localStorage.length }, (_, i) =>
      window.localStorage.key(i),
    );
    expect(keys).toEqual(["sim.marks." + NEXT_ATTEMPT]);
  });

  test("a record written by a tab from before the move to local storage is still read", () => {
    window.sessionStorage.setItem(
      "sim.marks." + ATTEMPT,
      JSON.stringify({ viewed: ["q04"], marked: ["q04"] }),
    );
    const store = new MarksStore();
    store.setScope(ATTEMPT);
    expect(store.isMarked("q04")).toBe(true);
  });

  test("a flag set in another open tab shows up in this one", () => {
    const here = new MarksStore();
    here.setScope(ATTEMPT);
    let notified = 0;
    here.subscribe(() => notified++);

    const key = "sim.marks." + ATTEMPT;
    const value = JSON.stringify({ viewed: ["q07"], marked: ["q07"] });
    window.localStorage.setItem(key, value);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));

    expect(here.isMarked("q07")).toBe(true);
    expect(notified).toBe(1);
  });

  test("corrupt storage is ignored rather than thrown", () => {
    window.localStorage.setItem("sim.marks." + ATTEMPT, "{not json");
    const store = new MarksStore();
    expect(() => store.setScope(ATTEMPT)).not.toThrow();
    expect(store.isViewed("q01")).toBe(false);
  });
});
