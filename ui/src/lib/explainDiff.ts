// Line matching for the explanation screen's two document panes.
//
// The grader emits two documents and never a diff, and never will:
// docs/bank-spec.md ("check-lint rules") bans `diff` inside a validator
// because SCORING on line order fails a correct answer that is merely
// ordered differently —
// two Service ports in the other sequence are the same Service. Rendering
// carries no such hazard: a highlight that lands on the wrong line is a
// highlight, not a lost point. So the comparison is computed here, in the
// client, and the ban upstream is left exactly where it is.
//
// A plain LCS over whole lines, with no dependency. Not word- or
// character-level: both panes are `kubectl get -o yaml | k8s_clean`
// renderings of one object, where a difference is a field that is
// present, absent, or set to something else — which is a line. Sub-line
// highlighting would also need a second colour channel inside an already
// tinted row, and there is no such channel.

/** One line of one pane, with whether it has a counterpart in the other. */
export interface DiffLine {
  text: string;
  /**
   * True when this line has no partner in the other document. Which
   * DIRECTION that means is the pane's business, not this module's: an
   * unmatched line in the actual pane is something the candidate has and
   * the reference does not, and the reverse in the expected pane.
   */
  changed: boolean;
}

export interface DocumentDiff {
  actual: DiffLine[];
  expected: DiffLine[];
  /**
   * False when the documents were too long to match and every line is
   * reported unchanged. The caller must say so rather than let a pane
   * with no marks read as "these are identical".
   */
  compared: boolean;
  /** Lines with no counterpart, summed across both panes. Zero means the
   *  two documents are identical line for line — which is worth saying,
   *  because a check that failed against an identical capture failed on
   *  something the capture does not show. */
  changedLines: number;
}

/**
 * The LCS table is O(n·m) in time AND memory, and these bodies come off a
 * cluster: a `get -o yaml` of a List can be thousands of lines. 800² is
 * ~2.5MB of Int32Array and a few milliseconds; an unbounded pair of
 * 20k-line documents would allocate 1.6GB and hang the tab. Past the cap
 * the panes still render — they just render without marks, and say so.
 */
const MAX_LINES = 800;

/** Split a document body the way the panes will render it. */
export function toLines(body: string): string[] {
  // Exactly one trailing newline is stripped: `_artifact` in
  // banks/_lib/checks.sh prints the body through `%s\n`, so every
  // document arrives with one that is punctuation rather than content.
  // A second blank line at the end is the document's own and stays.
  return body.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

export function diffDocuments(actualBody: string, expectedBody: string): DocumentDiff {
  const a = toLines(actualBody);
  const b = toLines(expectedBody);

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return {
      actual: a.map((text) => ({ text, changed: false })),
      expected: b.map((text) => ({ text, changed: false })),
      compared: false,
      changedLines: 0,
    };
  }

  // dp[i][j] = length of the longest common subsequence of a[i:] and
  // b[j:]. Filled backwards so the forward walk below can read it
  // greedily, which is what keeps the matched lines in document order.
  // One flat Int32Array rather than an array of arrays: the row stride is
  // constant and the allocation is one object instead of n.
  const stride = b.length + 1;
  const dp = new Int32Array((a.length + 1) * stride);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * stride + j] =
        a[i] === b[j]
          ? dp[(i + 1) * stride + (j + 1)] + 1
          : Math.max(dp[(i + 1) * stride + j], dp[i * stride + (j + 1)]);
    }
  }

  const actual: DiffLine[] = a.map((text) => ({ text, changed: true }));
  const expected: DiffLine[] = b.map((text) => ({ text, changed: true }));

  // Walk the table forward, clearing the flag on every line that is part
  // of the common subsequence. Everything the walk does not reach keeps
  // the `changed: true` it was built with.
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      actual[i].changed = false;
      expected[j].changed = false;
      matched++;
      i++;
      j++;
    } else if (dp[(i + 1) * stride + j] >= dp[i * stride + (j + 1)]) {
      i++;
    } else {
      j++;
    }
  }

  return {
    actual,
    expected,
    compared: true,
    changedLines: a.length - matched + (b.length - matched),
  };
}
