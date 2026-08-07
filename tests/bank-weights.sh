#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - "$@" <<'PY'
import os, re, sys, glob

TOLERANCE = 2.0

# Mirrors facilitator/internal/exam/exam.go tierOrder and tierBounds. A
# tier is its time band, so the label cannot drift into an opinion.
TIER_ORDER = ["quick", "core", "deep"]
TIER_BOUNDS = {"quick": (1, 240), "core": (241, 540), "deep": (541, 840)}

# How far a drawn tier count may sit from its share. The draw spends a
# domain's exact allocation on whichever tier is furthest behind, so a
# thin pool shows up here rather than in a candidate's tired afternoon.
TIER_TOLERANCE = 1

# Bounds on the drawn sitting as a fraction of spec.duration. Under is a
# bank that wastes the clock; over is one nobody finishes.
TIME_BAND = (0.85, 1.05)

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

def nested_map(text, key):
    """Parse a `key:` block of `  Name: 20` lines, ending at the next key
    at its own indentation or shallower. A negative is matched so a typo
    is caught rather than read as 'absent'."""
    m = re.search(rf"^(\s*){key}:\s*$", text, re.M)
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
        em = re.match(r"\s*(.+?):\s*(-?\d+)\s*$", line)
        if em:
            out[em.group(1).strip()] = int(em.group(2))
    return out or None

def domain_weights(text):
    return nested_map(text, "domainWeights")

def difficulty_mix(text):
    return nested_map(text, "difficultyMix")

def question_extras(text):
    """The keys that sit below `weight:` — Q_RE stops there on purpose,
    so read them per question chunk and order-independently."""
    out = {}
    chunks = re.split(r"^\s*-\s+id:\s*", text, flags=re.M)[1:]
    for chunk in chunks:
        qid = chunk.split("\n", 1)[0].strip()
        secs = re.search(r"^\s*targetSeconds:\s*(-?\d+)\s*$", chunk, re.M)
        tier = re.search(r"^\s*difficulty:\s*(\S+)\s*$", chunk, re.M)
        out[qid] = {
            "targetSeconds": int(secs.group(1)) if secs else None,
            "difficulty": tier.group(1) if tier else None,
        }
    return out

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
    that the Go implementation is the authority for anyway. Also used for
    spec.difficultyMix, which sums to 100 under the same rule."""
    raw = {d: weights[d] * n / 100 for d in order}
    targets = {d: int(raw[d]) for d in order}
    leftover = n - sum(targets.values())
    remainders = sorted(order, key=lambda d: (-(raw[d] - targets[d]), order.index(d)))
    for d in remainders[:leftover]:
        targets[d] += 1
    return targets

def tier_draw(pool_by_domain_tier, order, dom_targets, tier_deficit):
    """The tier half of exam.go's drawMixed. Each domain spends its exact
    allocation on whichever tier is furthest behind, and a shortfall
    carries to the next domain rather than bending the domain split.
    Which question comes out is seeded; how many of each tier is not —
    so simulating the counts needs no seed and covers every draw."""
    got = {t: 0 for t in TIER_ORDER}
    deficit = dict(tier_deficit)
    for d in order:
        left = {t: pool_by_domain_tier.get(d, {}).get(t, 0) for t in TIER_ORDER}
        for _ in range(dom_targets[d]):
            best = None
            for t in TIER_ORDER:
                if left[t] == 0:
                    continue
                if best is None or deficit[t] > deficit[best]:
                    best = t
            if best is None:
                return None
            left[best] -= 1
            deficit[best] -= 1
            got[best] += 1
    return got

def domain_order(questions):
    """Each distinct domain once, in first-appearance order — what
    exam.go's domainOrder produces, and what the largest-remainder
    tie-break above depends on."""
    order = []
    for q in questions:
        if q["domain"] not in order:
            order.append(q["domain"])
    return order

def duration(text):
    """spec.duration in seconds. Go duration strings, but banks only ever
    write minutes or hours, so anything else is treated as unknown rather
    than guessed at."""
    m = re.search(r"^\s*duration:\s*(\d+)(m|h)\s*$", text, re.M)
    if not m:
        return None
    return int(m.group(1)) * (60 if m.group(2) == "m" else 3600)

def report_tiers(bank, questions, extras, mix, order, dom_targets, length, clock):
    pool = {}
    for q in questions:
        tier = extras[q["id"]]["difficulty"]
        pool.setdefault(q["domain"], {}).setdefault(tier, []).append(q["id"])

    want = domain_targets(mix, TIER_ORDER, length)
    print(f"  levels — {length} drawn as "
          + ", ".join(f"{want[t]} {t}" for t in TIER_ORDER)
          + f" (mix {'/'.join(str(mix.get(t, 0)) for t in TIER_ORDER)})")
    head = "".join(f"{t:>7}" for t in TIER_ORDER)
    print(f"        {head}   pool  draw  domain")
    for d in order:
        cells = "".join(f"{len(pool.get(d, {}).get(t, [])):>7}" for t in TIER_ORDER)
        held = sum(len(v) for v in pool.get(d, {}).values())
        print(f"        {cells}   {held:>4}  {dom_targets[d]:>4}  {d}")

    counts = {d: {t: len(ids) for t, ids in tiers.items()} for d, tiers in pool.items()}
    got = tier_draw(counts, order, dom_targets, want)
    if got is None:
        fail(bank, "the draw runs out of questions before it fills a domain — "
                   "the pool-depth check above should have caught this")
        return
    for t in TIER_ORDER:
        drift = got[t] - want[t]
        if abs(drift) > TIER_TOLERANCE:
            fail(bank, f"every draw holds {got[t]} {t} questions, want {want[t]} "
                       f"(drift {drift:+d}, tolerance {TIER_TOLERANCE}) — "
                       f"the pool is too thin in {t} for this mix")

    if clock is None:
        print("        (spec.duration not in minutes or hours — sitting length not checked)")
        return

    # Which question comes out is seeded, so the honest figure is the mean
    # of each tier weighted by how many of it every draw takes.
    spent = 0.0
    for t in TIER_ORDER:
        secs = [extras[q["id"]]["targetSeconds"] for q in questions
                if extras[q["id"]]["difficulty"] == t]
        if secs:
            spent += got[t] * sum(secs) / len(secs)
    ratio = spent / clock
    lo, hi = TIME_BAND
    mark = "ok " if lo <= ratio <= hi else "OFF"
    print(f"  [{mark}] sitting {spent/60:5.1f} min of a {clock//60} min clock "
          f"({ratio:.0%} — band {lo:.0%}-{hi:.0%})")
    if not lo <= ratio <= hi:
        fail(bank, f"a drawn sitting is {spent/60:.1f} min of task time against a "
                   f"{clock//60} min clock ({ratio:.0%}), outside {lo:.0%}-{hi:.0%}")

for exam_path in sorted(glob.glob("banks/*/exam.yaml")):
    bank_dir = os.path.dirname(exam_path)
    bank = os.path.basename(bank_dir)
    text = open(exam_path, encoding="utf-8").read()

    if re.search(r"^\s*examType:\s*mcq\s*$", text, re.M):
        if difficulty_mix(text) is not None:

            fail(bank, "an mcq bank declares spec.difficultyMix, and the tier gate "
                       "below only runs for hands-on banks — teach tests/bank-mcq.sh "
                       "the tiers before shipping this")
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

    extras = question_extras(text)
    mix = difficulty_mix(text)

    if mix is None:
        for q in questions:
            if extras.get(q["id"], {}).get("difficulty"):
                fail(bank, f"{q['id']} declares a difficulty but the bank declares no "
                           f"spec.difficultyMix to draw against")
    else:
        unknown_tiers = [t for t in mix if t not in TIER_BOUNDS]
        for t in sorted(unknown_tiers):
            fail(bank, f"spec.difficultyMix names an unknown tier {t!r}, "
                       f"want one of {', '.join(TIER_ORDER)}")
        if sum(mix.values()) != 100:
            fail(bank, f"spec.difficultyMix sums to {sum(mix.values())}, want 100")
        if not pooled:
            fail(bank, "spec.difficultyMix is declared but the bank is not pooled, so "
                       "every attempt asks every question and the mix decides nothing")
        for q in questions:
            e = extras.get(q["id"], {})
            tier, secs = e.get("difficulty"), e.get("targetSeconds")
            if tier not in TIER_BOUNDS:
                fail(bank, f"{q['id']} has difficulty {tier!r}; a bank declaring "
                           f"spec.difficultyMix declares a tier on every question")
                continue
            if secs is None:
                fail(bank, f"{q['id']} is {tier} but sets no targetSeconds; the tier is "
                           f"the time band, so it cannot be derived from the points")
                continue
            lo, hi = TIER_BOUNDS[tier]
            if not lo <= secs <= hi:
                fail(bank, f"{q['id']} is {tier} with targetSeconds {secs}, "
                           f"outside that tier's {lo}-{hi} band")

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

        if mix is not None and not [f for f in failures if f.startswith(f"{bank}: ")]:
            report_tiers(bank, questions, extras, mix, order, targets, length, duration(text))
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
