export interface DiffLine {
  text: string;

  changed: boolean;
}

export interface DocumentDiff {
  actual: DiffLine[];
  expected: DiffLine[];

  compared: boolean;

  changedLines: number;
}

const MAX_LINES = 800;

export function toLines(body: string): string[] {
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
