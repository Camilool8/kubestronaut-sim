import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { strings } from "./strings";
import { ExamIntro } from "./components/ExamIntro";

const EM_DASH = "—";

const EMPTY_VALUE_PLACEHOLDERS = new Set([
  "exams.bestNoScore",
  "score.notRecorded",
  "progress.noScore",
]);

type Leaf = { path: string; value: string; kind: "string" | "function" };

function leaves(node: unknown, path: string[] = []): Leaf[] {
  if (typeof node === "string") return [{ path: path.join("."), value: node, kind: "string" }];
  if (typeof node === "function") {
    return [{ path: path.join("."), value: node.toString(), kind: "function" }];
  }
  if (Array.isArray(node)) return node.flatMap((item, i) => leaves(item, [...path, String(i)]));
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]));
  }
  return [];
}

describe("visible copy uses no em dashes", () => {
  const all = leaves(strings);

  test("the walk reaches the copy it is meant to police", () => {
    expect(all.length).toBeGreaterThan(500);
    expect(all.some((l) => l.path === "intro.legend.1.body")).toBe(true);
    expect(all.some((l) => l.path === "score.levelNames.quick")).toBe(true);
  });

  test("no string carries an em dash, except a lone one standing for an empty value", () => {
    const offenders = all
      .filter((l) => l.kind === "string" && l.value.includes(EM_DASH))
      .filter((l) => !(EMPTY_VALUE_PLACEHOLDERS.has(l.path) && l.value === EM_DASH))
      .map((l) => `${l.path}: ${l.value}`);

    expect(offenders, "replace the dash with the punctuation the sentence needs").toEqual([]);
  });

  test("no copy built by a function carries an em dash", () => {
    const offenders = all
      .filter((l) => l.kind === "function" && l.value.includes(EM_DASH))
      .map((l) => l.path);

    expect(offenders, "replace the dash with the punctuation the sentence needs").toEqual([]);
  });

  test("each empty-value placeholder is still exactly one dash", () => {
    const byPath = new Map(all.map((l) => [l.path, l.value]));
    for (const path of EMPTY_VALUE_PLACEHOLDERS) {
      expect(byPath.get(path), `${path} was renamed; update the allowlist`).toBe(EM_DASH);
    }
  });

  test("the exam intro joins its run-in headings without one", () => {
    const { baseElement } = render(<ExamIntro onClose={() => {}} />);
    expect(baseElement.textContent).not.toContain(EM_DASH);
  });
});
