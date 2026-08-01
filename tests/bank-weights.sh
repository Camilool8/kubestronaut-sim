#!/usr/bin/env bash
# Checks that every bank's points are distributed the way its exam.yaml
# says they should be. Offline: no cluster, no containers, no yq — it
# reads banks/ off disk, so it runs in seconds and belongs at the *top*
# of smoke.sh rather than forty minutes into it.
#
# Three invariants, per bank (see docs/bank-spec.md):
#
#   1. each domain's share of the points is within TOLERANCE percentage
#      points of its spec.domainWeights entry;
#   2. a question's `weight:` equals the sum of its `# points:` headers;
#   3. the questions in exam.yaml and the q*/ directories on disk are
#      the same set.
#
# A bank with no spec.domainWeights is skipped for (1) — smoke-01, the
# hidden switch-test fixture, has no curriculum mapping — but still
# checked for (2) and (3).
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - "$@" <<'PY'
import os, re, sys, glob

TOLERANCE = 2.0  # percentage points

# exam.yaml is machine-shaped and simple, so it is parsed with regexes
# rather than dragging in a YAML library the rest of the tests do not
# need. That is only safe because of the cross-check below: if the
# regexes ever stop matching the file's real shape, the question count
# disagrees with the directory listing and this exits non-zero. It can
# fail; it cannot silently pass by finding nothing.
Q_RE = re.compile(
    r"-\s+id:\s*(?P<id>\S+)\s*\n"
    r"\s+instance:\s*(?P<instance>\S+)\s*\n"
    r"\s+domain:\s*(?P<domain>.+?)\s*\n"
    r"\s+weight:\s*(?P<weight>\d+)\s*$",
    re.M,
)
# Exactly the Go loader's contract (facilitator/internal/exam/exam.go
# parsePoints): one space after the colon, no leading zeros. Looser is
# worse than none — "# points: 08" was counted as 8 here and skipped as 0
# by the grader, so the two silently disagreed about what a question was
# worth. tests/check-lint.sh enforces the same pattern on the headers.
POINTS_RE = re.compile(r"^# points: (0|[1-9][0-9]*)$", re.M)

failures = []


def fail(bank, msg):
    failures.append(f"{bank}: {msg}")


def domain_weights(text):
    """Parse the optional spec.domainWeights block: `  Name: 20` lines
    under a `domainWeights:` key, ending at the next key at its own
    indentation or shallower."""
    m = re.search(r"^(\s*)domainWeights:\s*$", text, re.M)
    if not m:
        return None
    indent = len(m.group(1))
    out = {}
    for line in text[m.end():].splitlines():
        if not line.strip():
            continue
        cur = len(line) - len(line.lstrip())
        if cur <= indent:
            break
        em = re.match(r"\s*(.+?):\s*(\d+)\s*$", line)
        if em:
            out[em.group(1).strip()] = int(em.group(2))
    return out or None


for exam_path in sorted(glob.glob("banks/*/exam.yaml")):
    bank_dir = os.path.dirname(exam_path)
    bank = os.path.basename(bank_dir)
    text = open(exam_path, encoding="utf-8").read()

    # MCQ banks have a different question shape (no instance, no
    # validate.d) and their own gate: tests/bank-mcq.sh. Skip them here
    # BEFORE the directory cross-check, or (3) fails on every mcq bank.
    if re.search(r"^\s*examType:\s*mcq\s*$", text, re.M):
        print(f"{bank}: mcq — covered by tests/bank-mcq.sh")
        continue

    questions = [m.groupdict() for m in Q_RE.finditer(text)]
    on_disk = sorted(
        os.path.basename(p) for p in glob.glob(os.path.join(bank_dir, "q*"))
        if os.path.isdir(p)
    )

    # (3) — and the guard that keeps the regex parsing honest.
    declared = sorted(q["id"] for q in questions)
    if declared != on_disk:
        only_yaml = sorted(set(declared) - set(on_disk))
        only_disk = sorted(set(on_disk) - set(declared))
        detail = []
        if only_yaml:
            detail.append(f"in exam.yaml but not on disk: {', '.join(only_yaml)}")
        if only_disk:
            detail.append(f"on disk but not in exam.yaml: {', '.join(only_disk)}")
        if not detail:
            detail.append(f"parsed {len(declared)} questions, found {len(on_disk)} directories")
        fail(bank, "; ".join(detail))
        continue

    # (2)
    points = {}
    for q in questions:
        total = 0
        checks = sorted(glob.glob(os.path.join(bank_dir, q["id"], "validate.d", "*.sh")))
        if not checks:
            fail(bank, f"{q['id']} has no validate.d checks")
        for c in checks:
            pm = POINTS_RE.search(open(c, encoding="utf-8").read())
            if not pm:
                fail(bank, f"{q['id']}/{os.path.basename(c)} has no '# points:' header")
                continue
            total += int(pm.group(1))
        points[q["id"]] = total
        if total != int(q["weight"]):
            fail(bank, f"{q['id']} weight is {q['weight']} but its checks total {total}")

    # (1)
    weights = domain_weights(text)
    grand = sum(points.values())
    if weights is None:
        print(f"{bank}: {len(questions)} questions, {grand} points "
              f"(no spec.domainWeights — domain balance not checked)")
        continue

    by_domain = {}
    for q in questions:
        by_domain.setdefault(q["domain"], 0)
        by_domain[q["domain"]] += points[q["id"]]

    unknown = set(by_domain) - set(weights)
    missing = set(weights) - set(by_domain)
    for d in sorted(unknown):
        fail(bank, f"domain {d!r} has questions but no spec.domainWeights entry")
    for d in sorted(missing):
        fail(bank, f"spec.domainWeights lists {d!r} but no question uses it")

    print(f"{bank}: {len(questions)} questions, {grand} points")
    for d in sorted(by_domain, key=lambda x: -by_domain[x]):
        got = by_domain[d] / grand * 100 if grand else 0
        want = weights.get(d)
        if want is None:
            continue
        drift = got - want
        mark = "ok " if abs(drift) <= TOLERANCE else "OFF"
        print(f"  [{mark}] {got:5.1f}%  target {want:2d}%  ({drift:+.1f})  {d}")
        if abs(drift) > TOLERANCE:
            fail(bank, f"{d} is {got:.1f}% of points, target {want}% "
                       f"(drift {drift:+.1f}pp, tolerance ±{TOLERANCE:g})")

if failures:
    print("\nBANK WEIGHTS FAIL:", file=sys.stderr)
    for f in failures:
        print(f"  {f}", file=sys.stderr)
    sys.exit(1)

print("\nbank weights OK")
PY
