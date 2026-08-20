#!/usr/bin/env bash
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
    # A check reads the API. Reaching a node instead grades whatever that
    # machine's disk happens to say, spends most of the 30s budget on a login
    # (a timed-out check is scored FAILED), and breaks the moment a question
    # moves to another node or cluster. There is exactly one thing no API can
    # answer — whether an etcd snapshot FILE on a node is a valid snapshot —
    # so the exception is a marker on the offending line, not a blanket
    # allowance, and every use of it is listed at the end of a run.
    ("node-read", re.compile(r"(?<![\w.-])(?:ssh|scp)(?![\w-])"),
     "a check reads the cluster API, not a node's filesystem: ssh/scp from a "
     "grader spends the 30s budget on a login and grades a machine rather than "
     "the answer. If this really is something no API can see (the etcd snapshot "
     "file is the one such case), put '# lint: allow-node-read' on this line — "
     "the run then lists it as a documented exception. If instead the word is "
     "prose inside an evidence note or a failure message, reword it ('login "
     "alias', 'from the node's own shell'): the match is on the bare token by "
     "design, because a rule that tried to tell a command from a sentence would "
     "have to miss wrapped calls like 'timeout 5 ssh …'. Do NOT silence prose "
     "with the marker — it would document a node read that does not exist"),
]

SOFT = [
    ("index", re.compile(r"\[0\]"),
     "fixed [0] index — prefer selecting by name/content; add '# lint: allow-index' if the list is pinned to one element"),
]

EXEMPT = {
    "get-yaml": re.compile(r"show_(?:actual|expected)\b.*\|\s*k8s_clean\b"),
}

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

LIB = pathlib.Path("banks/_lib/checks.sh")
HELPERS = sorted(set(re.findall(r"^([a-z_][a-z0-9_]*)\(\)", LIB.read_text(), re.MULTILINE))) if LIB.is_file() else []
CALLS = re.compile(r"(?:^|[|&;(]|\$\(|\s)(" + "|".join(HELPERS) + r")(?=\s|$|[)|;&])") if HELPERS else None

errors, warnings, node_reads = [], [], []

for path in scripts:
    text = path.read_text()
    lines = text.splitlines()

    header_like = re.compile(r"^#\s*points\s*:", re.IGNORECASE)
    headers = [ln for ln in lines if header_like.match(ln.lstrip())]
    if not headers:
        errors.append((path, 0, "points", "no '# points: N' header — the grader will skip this check entirely"))
    else:
        for ln in headers:
            if not POINTS_OK.match(ln):
                errors.append((path, lines.index(ln) + 1, "points",
                               f"header {ln!r} does not match '# points: N' exactly (no leading zeros, one space)"))

    # A check that scores criteria has to emit the tally. Without report the
    # sentinels never reach the grader, the check silently reverts to
    # all-or-nothing, and nothing anywhere says so.
    crit_lines = [i for i, ln in enumerate(lines, 1)
                  if re.search(r"(?:^|[|&;(]|\s)crit\s", ln) and not ln.strip().startswith("#")]
    code = "\n".join(ln for ln in lines if not ln.strip().startswith("#"))
    if crit_lines and not re.search(r"(?:^|[|&;(]|\s)report(?=\s|$|[)|;&])", code, re.MULTILINE):
        errors.append((path, crit_lines[0], "crit-without-report",
                       "uses crit but never calls report — the criterion tally is never "
                       "emitted, so the grader falls back to all-or-nothing and the partial "
                       "credit silently disappears"))

    # report decides the exit status, so anything after it is dead code and any
    # explicit exit after it throws the status away.
    for i, line in enumerate(lines, 1):
        if re.match(r"^\s*report\s*$", line):
            for j in range(i, len(lines)):
                tail = lines[j].strip()
                if tail and not tail.startswith("#"):
                    errors.append((path, j + 1, "code-after-report",
                                   f"{tail!r} follows report, which already sets the check's "
                                   f"exit status — this line either never runs or discards it"))
                    break

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

    # evaluate.go awards a check its full points whenever it exits 0, and only
    # consults the criterion tally when it does not. report() returns
    # crit_all_passed, so anything after it becomes the script's exit status and
    # a wholly failed check scores full marks in silence.
    report_at = [i for i, line in enumerate(lines, 1)
                 if re.match(r"\s*report\b", line)]
    if report_at:
        for i, line in enumerate(lines, 1):
            if i <= report_at[-1] or not line.strip() or line.strip().startswith("#"):
                continue
            errors.append((path, i, "after-report",
                           f"{line.strip()!r} runs after report(), so it — not report() — "
                           f"sets the exit status. A check that exits 0 is scored full "
                           f"marks without its criteria being read, so every criterion "
                           f"could fail and the candidate would still get the points. "
                           f"report() must be the last command in the script"))
            break

    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        for rule, pat, msg in HARD:
            if not pat.search(line):
                continue
            if f"lint: allow-{rule}" in line:
                # An allowed node read is the bank's one documented departure
                # from API-only grading. Counting it here is what keeps it
                # documented: the marker cannot spread quietly, because every
                # run prints where it is.
                if rule == "node-read":
                    node_reads.append((path, i))
                continue
            if rule in EXEMPT and EXEMPT[rule].search(line):
                continue
            errors.append((path, i, rule, msg))
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

if node_reads:
    print()
    print(f"check-lint: {len(node_reads)} check(s) read a node instead of the API, "
          f"each with an explicit '# lint: allow-node-read'. That is meant to be a "
          f"handful of lines across all banks — review any new one:")
    for path, line in node_reads:
        print(f"      {path}:{line}")

print()
print(f"check-lint: {len(scripts)} checks, {len(errors)} errors, {len(warnings)} warnings")
sys.exit(1 if errors else 0)

PY
