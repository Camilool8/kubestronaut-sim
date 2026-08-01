#!/usr/bin/env bash
# Checks every mcq bank (spec.examType: mcq) the way bank-weights.sh
# checks the hands-on ones. Offline: no cluster, no containers, no yq —
# it reads banks/ off disk, so it runs in seconds and belongs at the
# *top* of smoke.sh rather than forty minutes into it.
#
# Six invariants, per bank:
#
#   1. the questions in exam.yaml and the q*/ directories on disk are
#      the same set;
#   2. every question is well-formed: a non-empty question.md, a real
#      explanation in solution.md, 3-6 options, and a correct list that
#      is unique, sorted, in range, and sized to match `multi`;
#   3. mcq purity: no setup.sh, no validate.d/, no files/ anywhere in
#      the bank — those belong to hands-on banks, and a stray one here
#      means a question was ported without changing shape;
#   4. spec.domainWeights is present, sums to 100, and names exactly
#      the domains the questions use;
#   5. WITHOUT spec.examLength (or one >= the pool): each domain's share
#      of the points is within TOLERANCE percentage points of its
#      spec.domainWeights entry — the whole pool IS the exam every
#      attempt, so its own composition has to match the curriculum.
#      WITH a smaller spec.examLength: exam.DrawMCQ stratifies every
#      draw to hit each domain's target count exactly regardless of the
#      pool's own ratio (see facilitator/internal/exam/exam.go), so what
#      this gate checks instead is that every domain's pool is at LEAST
#      as deep as that target — a draw must always be possible;
#   6. the answer key is not degenerate: no single option index is the
#      answer to more than half of the single-answer questions.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - "$@" <<'PY'
import os, re, sys, glob

TOLERANCE = 2.0     # percentage points
MIN_SOLUTION = 200  # characters — "the answer is B" is not an explanation
MIN_OPTIONS, MAX_OPTIONS = 3, 6

# exam.yaml is machine-shaped and simple, so it is parsed with regexes
# rather than dragging in a YAML library the rest of the tests do not
# need. That is only safe because of the cross-check below: if the
# regexes ever stop matching the file's real shape, the question count
# disagrees with the directory listing and this exits non-zero. It can
# fail; it cannot silently pass by finding nothing.
Q_RE = re.compile(
    r"-\s+id:\s*(?P<id>\S+)\s*\n"
    r"(?:\s+title:\s*.+\n)?"
    r"\s+domain:\s*(?P<domain>.+?)\s*\n"
    r"(?:\s+weight:\s*(?P<weight>\d+)\s*\n)?"
    r"\s+multi:\s*(?P<multi>true|false)\s*\n"
    r"\s+options:\s*\n"
    r"(?P<options>(?:[ \t]+-[ \t].*\n)+)"
    r"\s+correct:\s*\[(?P<correct>[^\]\n]*)\]\s*$",
    re.M,
)

failures = []


def fail(bank, msg):
    failures.append(f"{bank}: {msg}")


def domain_weights(text):
    """Parse the spec.domainWeights block: `  Name: 20` lines under a
    `domainWeights:` key, ending at the next key at its own indentation
    or shallower. Same parser as tests/bank-weights.sh."""
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
    """Parse spec.examLength: N, or None when absent."""
    m = re.search(r"^\s*examLength:\s*(\d+)\s*$", text, re.M)
    return int(m.group(1)) if m else None


def domain_targets(weights, order, n):
    """Largest-remainder rounding of n across order's domains, in the
    ratios weights declares — the exact algorithm exam.DrawMCQ uses
    (facilitator/internal/exam/exam.go), so this gate checks pool depth
    against the same numbers a real draw will ask for."""
    raw = {d: weights[d] * n / 100 for d in order}
    targets = {d: int(raw[d]) for d in order}
    leftover = n - sum(targets.values())
    remainders = sorted(order, key=lambda d: (-(raw[d] - targets[d]), order.index(d)))
    for d in remainders[:leftover]:
        targets[d] += 1
    return targets


def parse_options(block):
    """Each option is one `- scalar` line, optionally quoted. A line
    that is not that shape (multi-line scalar, nested map) returns None
    so the caller fails the question rather than miscounting."""
    out = []
    for line in block.splitlines():
        m = re.match(r"[ \t]+-[ \t]+(\S.*?)\s*$", line)
        if m is None:
            return None
        val = m.group(1)
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        elif re.search(r":(\s|$)", val):
            # Unquoted with `key: value` shape — YAML reads that as a
            # map, not the string this regex would have pretended it is.
            return None
        if not val.strip():
            return None
        out.append(val)
    return out


def parse_correct(raw):
    raw = raw.strip()
    if not raw:
        return []
    try:
        return [int(x) for x in raw.split(",")]
    except ValueError:
        return None


for exam_path in sorted(glob.glob("banks/*/exam.yaml")):
    bank_dir = os.path.dirname(exam_path)
    bank = os.path.basename(bank_dir)
    text = open(exam_path, encoding="utf-8").read()

    # The mirror of bank-weights.sh's skip: hands-on banks have their
    # own gate, and their question shape would fail every regex here.
    if not re.search(r"^\s*examType:\s*mcq\s*$", text, re.M):
        print(f"{bank}: hands-on — covered by tests/bank-weights.sh")
        continue

    questions = [m.groupdict() for m in Q_RE.finditer(text)]
    on_disk = sorted(
        os.path.basename(p) for p in glob.glob(os.path.join(bank_dir, "q*"))
        if os.path.isdir(p)
    )

    # (1) — and the guard that keeps the regex parsing honest.
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

    # (3) — anywhere in the bank, not just the expected places: a
    # misplaced validate.d/ is exactly the kind of thing "expected
    # places" would miss.
    for root, dirs, files in os.walk(bank_dir):
        for d in sorted(dirs):
            if d in ("validate.d", "files"):
                rel = os.path.relpath(os.path.join(root, d), bank_dir)
                fail(bank, f"{rel}/ exists — an mcq bank has no {d}/")
        if "setup.sh" in files:
            rel = os.path.relpath(os.path.join(root, "setup.sh"), bank_dir)
            fail(bank, f"{rel} exists — mcq questions have no setup")

    # (2) — per question, plus the points map (4) and (5) read from.
    points = {}
    for q in questions:
        qid = q["id"]
        qdir = os.path.join(bank_dir, qid)
        points[qid] = int(q["weight"]) if q["weight"] else 1

        qmd = os.path.join(qdir, "question.md")
        if not os.path.isfile(qmd) or not open(qmd, encoding="utf-8").read().strip():
            fail(bank, f"{qid}/question.md is missing or empty")

        smd = os.path.join(qdir, "solution.md")
        if not os.path.isfile(smd):
            fail(bank, f"{qid}/solution.md is missing")
        else:
            sol = open(smd, encoding="utf-8").read().strip()
            if len(sol) < MIN_SOLUTION:
                fail(bank, f"{qid}/solution.md is {len(sol)} characters — the "
                           f"contract is an explanation, minimum {MIN_SOLUTION}")

        opts = parse_options(q["options"])
        if opts is None:
            fail(bank, f"{qid} has a malformed options block "
                       f"(each option must be one `- scalar` line)")
            continue
        n = len(opts)
        if not (MIN_OPTIONS <= n <= MAX_OPTIONS):
            fail(bank, f"{qid} has {n} options, want {MIN_OPTIONS}-{MAX_OPTIONS}")

        correct = parse_correct(q["correct"])
        if correct is None or not correct:
            fail(bank, f"{qid} has a malformed or empty correct list")
            continue
        if any(i < 0 or i >= n for i in correct):
            fail(bank, f"{qid} correct list {correct} is out of range for {n} options")
            continue
        if sorted(set(correct)) != correct:
            fail(bank, f"{qid} correct list {correct} must be unique and sorted ascending")
        if q["multi"] == "false" and len(correct) != 1:
            fail(bank, f"{qid} is single-answer but lists {len(correct)} correct indices")
        # All correct is as degenerate as one: "select all that apply"
        # where all apply grades right on a straight select-everything.
        if q["multi"] == "true" and not (2 <= len(correct) <= n - 1):
            fail(bank, f"{qid} is multi but lists {len(correct)} correct indices, "
                       f"want 2..{n - 1}")

    # (6) — a key where one letter is right most of the time grades a
    # candidate's test-taking reflexes, not their knowledge.
    singles = [q for q in questions if q["multi"] == "false"]
    counts = {}
    for q in singles:
        c = parse_correct(q["correct"])
        if c and len(c) == 1:
            counts[c[0]] = counts.get(c[0], 0) + 1
    for idx in sorted(counts):
        if counts[idx] * 2 > len(singles):
            fail(bank, f"option index {idx} is the answer to {counts[idx]} of "
                       f"{len(singles)} single-answer questions — degenerate key")

    # (4)
    weights = domain_weights(text)
    grand = sum(points.values())
    if weights is None:
        fail(bank, "spec.domainWeights is missing — an mcq bank must declare "
                   "its curriculum split")
        print(f"{bank}: {len(questions)} questions, {grand} points "
              f"(no spec.domainWeights)")
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

    # (5)
    n = exam_length(text)
    pooled = n is not None and n < len(questions)
    print(f"{bank}: {len(questions)} questions, {grand} points"
          + (f", examLength {n}" if pooled else ""))

    if pooled:
        # A stratified draw hits its target count regardless of the
        # pool's own ratio, so what has to hold is pool depth, not
        # points-share — see the header comment above invariant 5.
        domain_order = []
        pool_count = {}
        for q in questions:
            d = q["domain"]
            if d not in pool_count:
                domain_order.append(d)
            pool_count[d] = pool_count.get(d, 0) + 1
        targets = domain_targets(weights, domain_order, n)
        for d in domain_order:
            have, want = pool_count[d], targets[d]
            mark = "ok " if have >= want else "OFF"
            print(f"  [{mark}] pool {have:3d}  draw target {want:3d}  {d}")
            if have < want:
                fail(bank, f"{d} has {have} questions, but a {n}-question draw "
                           f"needs {want} — the pool is too shallow for this domain")
    else:
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
    print("\nBANK MCQ FAIL:", file=sys.stderr)
    for f in failures:
        print(f"  {f}", file=sys.stderr)
    sys.exit(1)

print("\nbank mcq OK")
PY
