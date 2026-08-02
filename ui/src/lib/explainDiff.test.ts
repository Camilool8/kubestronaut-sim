import { describe, expect, test } from "vitest";
import { diffDocuments, toLines } from "./explainDiff";

const changed = (lines: { text: string; changed: boolean }[]) =>
  lines.filter((l) => l.changed).map((l) => l.text);

describe("toLines", () => {
  // Every artifact arrives with one trailing newline: _artifact in
  // banks/_lib/checks.sh prints the body through `%s\n`. Rendering it as a
  // final empty line puts a blank row at the foot of every pane.
  test("drops the one trailing newline the sentinel protocol adds", () => {
    expect(toLines("a\nb\n")).toEqual(["a", "b"]);
  });

  test("keeps a blank line that is the document's own", () => {
    expect(toLines("a\n\nb\n")).toEqual(["a", "", "b"]);
    expect(toLines("a\nb\n\n")).toEqual(["a", "b", ""]);
  });

  test("normalises CRLF, so a Windows-authored expected file still matches", () => {
    expect(toLines("a\r\nb\r\n")).toEqual(["a", "b"]);
  });
});

describe("diffDocuments", () => {
  test("marks nothing when the two documents agree", () => {
    const diff = diffDocuments("a\nb\nc\n", "a\nb\nc\n");
    expect(diff.changedLines).toBe(0);
    expect(changed(diff.actual)).toEqual([]);
    expect(changed(diff.expected)).toEqual([]);
  });

  test("marks a substituted line on both sides", () => {
    const diff = diffDocuments("a\nWRONG\nc\n", "a\nRIGHT\nc\n");
    expect(changed(diff.actual)).toEqual(["WRONG"]);
    expect(changed(diff.expected)).toEqual(["RIGHT"]);
    expect(diff.changedLines).toBe(2);
  });

  // The shape q19 produces: the candidate's Service is missing the
  // annotation block the reference has, and nothing else differs.
  test("marks only the expected side when a line is missing from the actual", () => {
    const diff = diffDocuments("metadata:\n  name: x\n", "metadata:\n  name: x\n  labels: {}\n");
    expect(changed(diff.actual)).toEqual([]);
    expect(changed(diff.expected)).toEqual(["  labels: {}"]);
  });

  test("marks only the actual side when it carries a line the expected does not", () => {
    const diff = diffDocuments("a\nstray: true\nb\n", "a\nb\n");
    expect(changed(diff.actual)).toEqual(["stray: true"]);
    expect(changed(diff.expected)).toEqual([]);
  });

  // The reason this is an LCS and not a positional zip: a document with a
  // line inserted near the top is otherwise reported as changed from that
  // line down, which is every line of a Kubernetes object.
  test("an insertion does not cascade into every line after it", () => {
    const diff = diffDocuments("a\nb\nc\nd\n", "a\nNEW\nb\nc\nd\n");
    expect(changed(diff.expected)).toEqual(["NEW"]);
    expect(changed(diff.actual)).toEqual([]);
  });

  test("reports every line of two wholly different documents", () => {
    const diff = diffDocuments("a\nb\n", "x\ny\n");
    expect(changed(diff.actual)).toEqual(["a", "b"]);
    expect(changed(diff.expected)).toEqual(["x", "y"]);
    expect(diff.changedLines).toBe(4);
  });

  test("compares an empty capture against a document without crashing", () => {
    const diff = diffDocuments("", "a\nb\n");
    // "" is one empty line, not zero lines — a pane that renders nothing
    // at all would look like a failed fetch.
    expect(diff.actual).toHaveLength(1);
    expect(changed(diff.expected)).toEqual(["a", "b"]);
    expect(diff.compared).toBe(true);
  });

  // The cap is not a nicety: the LCS table is O(n·m) in memory, and a
  // `get -o yaml` over a List can run to thousands of lines. Past it the
  // panes still render, unmarked, and `compared` is how the screen knows
  // to say so instead of implying the two agree.
  test("refuses to compare documents past the line cap, and says so", () => {
    const long = Array.from({ length: 900 }, (_, i) => `line ${i}`).join("\n");
    const diff = diffDocuments(long, "a\n");
    expect(diff.compared).toBe(false);
    expect(diff.changedLines).toBe(0);
    expect(diff.actual).toHaveLength(900);
    expect(changed(diff.actual)).toEqual([]);
  });

  test("compares documents at the cap", () => {
    const lines = Array.from({ length: 800 }, (_, i) => `line ${i}`);
    const diff = diffDocuments(lines.join("\n"), [...lines.slice(0, 799), "other"].join("\n"));
    expect(diff.compared).toBe(true);
    expect(changed(diff.actual)).toEqual(["line 799"]);
  });
});
