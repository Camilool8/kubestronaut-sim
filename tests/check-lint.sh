#!/usr/bin/env bash
# Lints validate.d checks for the idioms that fail correct answers.
#
# The bug class this exists to prevent: a check that grades how a
# candidate spelled something rather than what they did. A `diff` makes
# line order part of the answer. A `grep` on a YAML file makes
# indentation part of the answer. `kubectl get -o yaml` hands a check the
# serialised form instead of the API's normalised object, which is the
# only reason key order could ever matter. Each one passes review easily
# and costs a candidate points they earned.
#
# Offline and instant, run from smoke.sh next to bank-weights.sh so a bad
# check fails in two seconds rather than forty minutes into a cold boot.
#
# Escape hatch: `# lint: allow-<rule>` on the offending line.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - "$@" <<'PY'
import pathlib
import re
import sys

ROOT = pathlib.Path(".")
scripts = sorted(ROOT.glob("banks/*/q*/validate.d/*.sh"))
if not scripts:
    print("check-lint: found no validate.d scripts — glob is wrong, refusing to pass")
    sys.exit(1)

# (rule, compiled pattern, message). Order is the report order.
HARD = [
    ("diff", re.compile(r"(?<![\w-])diff(?![\w-])"),
     "compare sets with same_set from _lib/checks.sh — diff makes line order and whitespace part of the answer"),
    ("grep-yaml", re.compile(r"grep\b[^|;&]*\.ya?ml\b"),
     "parse YAML with yq (or yaml_api_versions), never grep — indentation is not the candidate's answer"),
    ("get-yaml", re.compile(r"kubectl\b[^|;&]*-o\s+yaml"),
     "read fields with -o jsonpath or -o json | jq — the live object is already normalised, its serialisation is not"),
    ("kubectl-run", re.compile(r"kubectl\b[^|;&]*\brun\b")," "
     "do not create a Pod in a check: scheduling eats most of the 30s deadline, and a timed-out check is scored FAILED "
     "(this cost 10 points on a real run). kubectl exec into a workload the question already runs."),
    ("grep-qx", re.compile(r"grep\s+-[a-z]*x")," "
     "use file_text from _lib/checks.sh — grep -qx fails on a trailing space or a CRLF, which are not wrong answers"),
]

SOFT = [
    ("index", re.compile(r"\[0\]"),
     "fixed [0] index — prefer selecting by name/content; add '# lint: allow-index' if the list is pinned to one element"),
]

# The one shape get-yaml stands aside for. `-o yaml` is banned because
# SCORING on a serialisation grades the candidate's spelling; showing one
# is the opposite errand — the explanation screen's "YOUR CLUSTER STATE"
# pane needs a whole document, and there is no other way to produce one.
#
# The conjunction is the safety, not a proof. The pipe into k8s_clean
# and the show_ call have to be on the same line, so the ordinary way to
# smuggle a serialisation into a comparison — capture it in a variable,
# compare it below — still fails the gate. Someone determined could
# arrange both on one line and compare on the next; the point is that it
# would take arranging, which is what review is for. Anything else still
# needs the ordinary '# lint: allow-get-yaml' and the argument that goes
# with it.
EXEMPT = {
    "get-yaml": re.compile(r"show_(?:actual|expected)\b.*\|\s*k8s_clean\b"),
}

# Rules that fire when a line is RECOGNISED but MALFORMED, rather than
# when a banned pattern appears. Each is (rule, trigger, well_formed, msg):
# an error when trigger matches and well_formed does not.
#
# Both of these exist because the artifact protocol degrades silently by
# design. A malformed sentinel costs the candidate nothing at grade time
# — evaluate/artifact.go discards the block rather than failing a check a
# candidate is mid-exam on — which also means a bank author gets no
# signal at all that their evidence never arrived. Offline is the only
# place this can be noticed.
SHAPE = [
    ("artifact-sentinel",
     re.compile(r"^---8<--- sim:artifact"),
     re.compile(r"^---8<--- sim:artifact (actual|expected|why) [A-Za-z0-9_+-]{1,16}$"),
     "malformed artifact sentinel — the grammar is exactly "
     "'---8<--- sim:artifact <actual|expected|why> <lang>', one space between fields and "
     "nothing after the lang. Emit it with show_actual/show_expected/show_why from "
     "_lib/checks.sh rather than by hand"),
    ("artifact-call",
     re.compile(r"(?<![\w-])show_(?:actual|expected|why)(?![\w-])"),
     re.compile(r"(?<![\w-])(?:show_(?:actual|expected)\s+[A-Za-z0-9_+-]+\s+\S|show_why\s+\S)"),
     "show_actual/show_expected take a literal lang then a body/file ("
     "show_actual yaml \"$(...)\"); show_why takes the note. A lang built from a "
     "variable, or a missing one, produces a sentinel the grader drops on the floor"),
]

POINTS_OK = re.compile(r"^# points: (0|[1-9][0-9]*)$")

# Helpers defined by banks/_lib/checks.sh. Calling one without sourcing
# the library is a bash "command not found" at grade time, which the
# runner scores as a FAILED check — so a correct answer silently loses
# the points. This is not hypothetical: q21/30_adapted.sh shipped that
# way, and a smoke run showed the adapter emitting exactly `cpu 42` and
# `mem 71` while the check reported 0/3.
#
# Nothing offline could catch it before this rule: the script parses, the
# jsonpath is fine, and the failure only exists at runtime.
#
# The list is derived from the library rather than written down, so a
# helper added there is protected the day it lands. The trailing context
# accepts a closing paren and end-of-line as well as whitespace: the
# artifact helpers' natural shape ends a pipeline inside a command
# substitution — `"$(kubectl ... | k8s_clean)"` — and requiring a space
# after the name would have exempted exactly that call.
LIB = pathlib.Path("banks/_lib/checks.sh")
HELPERS = sorted(set(re.findall(r"^([a-z_][a-z0-9_]*)\(\)", LIB.read_text(), re.MULTILINE))) if LIB.is_file() else []
CALLS = re.compile(r"(?:^|[|&;(]|\$\(|\s)(" + "|".join(HELPERS) + r")(?=\s|$|[)|;&])") if HELPERS else None

errors, warnings = [], []

for path in scripts:
    text = path.read_text()
    lines = text.splitlines()

    # The points header must match the Go loader's contract EXACTLY
    # (facilitator/internal/exam/exam.go parsePoints). A looser reading
    # here is worse than none: "#points: 08" would be counted as 8 by the
    # weights gate and skipped as 0 by the grader, and the two would
    # silently disagree about what the question is worth.
    # Requires the colon: prose like "# points — when two runs happened"
    # is a comment, not a malformed header.
    header_like = re.compile(r"^#\s*points\s*:", re.IGNORECASE)
    headers = [ln for ln in lines if header_like.match(ln.lstrip())]
    if not headers:
        errors.append((path, 0, "points", "no '# points: N' header — the grader will skip this check entirely"))
    else:
        for ln in headers:
            if not POINTS_OK.match(ln):
                errors.append((path, lines.index(ln) + 1, "points",
                               f"header {ln!r} does not match '# points: N' exactly (no leading zeros, one space)"))

    # A helper is available if the library is sourced or the function is
    # defined right here. q07/30_resources.sh predates the library and
    # carries its own milli/mib, which is correct and must not trip this.
    if CALLS:
        sourced = "_lib/checks.sh" in text
        local = set(re.findall(r"^([a-z_][a-z0-9_]*)\(\)", text, re.MULTILINE))
        for i, line in enumerate(lines, 1):
            if line.strip().startswith("#"):
                continue
            for m in CALLS.finditer(line):
                fn = m.group(1)
                if not sourced and fn not in local:
                    errors.append((path, i, "unsourced-helper",
                                   f"calls {fn}() from _lib/checks.sh without sourcing it — "
                                   f"add '. /banks/_lib/checks.sh'. At grade time this is "
                                   f"'command not found', scored as a FAILED check, so a "
                                   f"correct answer loses the points"))

    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue  # a comment explaining a rule is not a violation of it
        for rule, pat, msg in HARD:
            if not pat.search(line) or f"lint: allow-{rule}" in line:
                continue
            if rule in EXEMPT and EXEMPT[rule].search(line):
                continue
            errors.append((path, i, rule, msg))
        # A local definition is not a call. q07 carries its own milli/mib
        # for the same reason, and the unsourced-helper rule already
        # allows it; a shape rule must not disagree.
        if not re.match(r"^\s*[a-z_][a-z0-9_]*\(\)", line):
            for rule, trigger, well_formed, msg in SHAPE:
                if trigger.search(line) and not well_formed.search(line) \
                        and f"lint: allow-{rule}" not in line:
                    errors.append((path, i, rule, msg))
        for rule, pat, msg in SOFT:
            if pat.search(line) and f"lint: allow-{rule}" not in line:
                warnings.append((path, i, rule, msg))

for path, line, rule, msg in warnings:
    print(f"warn  {path}:{line} [{rule}] {msg}")

for path, line, rule, msg in errors:
    print(f"FAIL  {path}:{line} [{rule}] {msg}")

print()
print(f"check-lint: {len(scripts)} checks, {len(errors)} errors, {len(warnings)} warnings")
sys.exit(1 if errors else 0)
PY
