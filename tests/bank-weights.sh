#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - "$@" <<'PY'
import os, re, sys, glob

TOLERANCE = 2.0

Q_RE = re.compile(
    r"-\s+id:\s*(?P<id>\S+)\s*\n"
    r"(?:\s+title:\s*.+\n)?"
    r"\s+instance:\s*(?P<instance>\S+)\s*\n"
    r"\s+domain:\s*(?P<domain>.+?)\s*\n"
    r"\s+weight:\s*(?P<weight>\d+)\s*$",
    re.M,
)
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

def exam_length(text):
    """Parse spec.examLength: N, or None when absent. Same parser as
    tests/bank-mcq.sh, widened to match a negative so a typo is caught
    here rather than read as 'absent'."""
    m = re.search(r"^\s*examLength:\s*(-?\d+)\s*$", text, re.M)
    return int(m.group(1)) if m else None

def domain_targets(weights, order, n):
    """Largest-remainder rounding of n across order's domains, in the
    ratios weights declares — the exact algorithm exam.Draw uses
    (facilitator/internal/exam/exam.go domainTargets), so this gate
    checks pool depth against the same numbers a real draw will ask for.
    Copied from tests/bank-mcq.sh rather than shared: these two gates
    are standalone scripts on purpose, and the algorithm is eight lines
    that the Go implementation is the authority for anyway."""
    raw = {d: weights[d] * n / 100 for d in order}
    targets = {d: int(raw[d]) for d in order}
    leftover = n - sum(targets.values())
    remainders = sorted(order, key=lambda d: (-(raw[d] - targets[d]), order.index(d)))
    for d in remainders[:leftover]:
        targets[d] += 1
    return targets

def domain_order(questions):
    """Each distinct domain once, in first-appearance order — what
    exam.go's domainOrder produces, and what the largest-remainder
    tie-break above depends on."""
    order = []
    for q in questions:
        if q["domain"] not in order:
            order.append(q["domain"])
    return order

for exam_path in sorted(glob.glob("banks/*/exam.yaml")):
    bank_dir = os.path.dirname(exam_path)
    bank = os.path.basename(bank_dir)
    text = open(exam_path, encoding="utf-8").read()

    if re.search(r"^\s*examType:\s*mcq\s*$", text, re.M):
        print(f"{bank}: mcq — covered by tests/bank-mcq.sh")
        continue

    questions = [m.groupdict() for m in Q_RE.finditer(text)]
    on_disk = sorted(
        os.path.basename(p) for p in glob.glob(os.path.join(bank_dir, "q*"))
        if os.path.isdir(p)
    )

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

    length = exam_length(text)
    if length is not None and length < 0:
        fail(bank, f"spec.examLength is {length}; a length is positive or absent")
        length = None
    if length is not None and length > len(questions):
        fail(bank, f"spec.examLength {length} exceeds the pool of {len(questions)} questions")
        length = None
    pooled = length is not None and 0 < length < len(questions)

    weights = domain_weights(text)
    grand = sum(points.values())
    if weights is None:
        print(f"{bank}: {len(questions)} questions, {grand} points "
              f"(no spec.domainWeights — domain balance not checked)")
        continue

    if sum(weights.values()) != 100:
        fail(bank, f"spec.domainWeights sums to {sum(weights.values())}, want 100")

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

    if pooled:
        order = domain_order(questions)
        targets = domain_targets(weights, order, length)
        print(f"{bank}: {len(questions)} questions, {grand} points "
              f"(pooled — every attempt draws {length})")
        for d in order:
            have = sum(1 for q in questions if q["domain"] == d)
            need = targets[d]
            mark = "ok " if have >= need else "OFF"
            print(f"  [{mark}] pool {have:3d}  draw {need:3d}  {d}")
            if have < need:
                fail(bank, f"{d} needs {need} questions for a {length}-question draw, "
                           f"pool has {have}")
        continue

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
