#!/usr/bin/env bash
# Every check either pairs its evidence with a generated expected document, or
# says in the file why it cannot.
#
# Before this gate, 193 of 212 checks showed the candidate their own cluster
# state and a paragraph telling them to go read the reference solution — and
# nothing anywhere recorded whether that was a decision or an omission. The
# two must not look alike, so the declaration is required and a `none` carries
# its reason.
#
#   bash tests/check-expected.sh [root]     # root defaults to the repo
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - "${1:-.}" <<'PY'
import pathlib, re, sys

root = pathlib.Path(sys.argv[1])
BANKS = ("cka-mock-01", "ckad-mock-01")
scripts = sorted(p for b in BANKS for p in root.glob(f"banks/{b}/q*/validate.d/*.sh"))
if not scripts:
    print(f"check-expected: found no validate.d scripts under {root} — refusing to pass")
    sys.exit(1)

DECL = re.compile(r"^#\s*expected:\s*(.+?)\s*$", re.M)
SNAP = re.compile(r"^\s*snapshot\s*\(\)", re.M)
PAIR = re.compile(r"^\s*show_pair\s+(\S+)\s+(\S+)", re.M)

problems = []
declared = {}   # (question dir, document name) -> the check that declared it
paired = optout = 0

for s in scripts:
    text = s.read_text()
    rel = s.relative_to(root)
    decls = DECL.findall(text)

    if not decls:
        problems.append(f"{rel}: no '# expected:' declaration. Add "
                        "'# expected: <name> <lang>' beside the '# points:' header, or "
                        "'# expected: none — <why this check has no comparable document>'")
        continue
    if len(decls) > 1:
        problems.append(f"{rel}: {len(decls)} '# expected:' declarations — a check pairs at most one document")
        continue

    decl = decls[0]
    has_snap = bool(SNAP.search(text))
    pair = PAIR.search(text)

    if decl.split()[0] == "none":
        optout += 1
        reason = decl[len("none"):].lstrip(" —-").strip()
        if not reason:
            problems.append(f"{rel}: opts out but gives no reason. Write "
                            "'# expected: none — <why>'; an unexplained opt-out is "
                            "indistinguishable from a check nobody looked at")
        if has_snap:
            problems.append(f"{rel}: opts out but defines snapshot() — delete it, or pair the check")
        if pair:
            problems.append(f"{rel}: opts out but calls show_pair — the two contradict each other")
        continue

    parts = decl.split()
    if len(parts) != 2:
        problems.append(f"{rel}: '# expected: {decl}' — want exactly '<name> <lang>'")
        continue
    name, lang = parts
    paired += 1

    if not has_snap:
        problems.append(f"{rel}: declares {name} but defines no snapshot() to generate it from")
    if not pair:
        problems.append(f"{rel}: declares {name} but never calls show_pair, so the pane is never shown")
    else:
        plang, pname = pair.group(1), pair.group(2)
        if plang != lang:
            problems.append(f"{rel}: declares lang '{lang}' but show_pair passes '{plang}'")
        if pname != name:
            problems.append(f"{rel}: declares {name} but show_pair reads {pname}")

    doc = s.parent.parent / "expected" / name
    if doc.exists():
        declared[(s.parent.parent, name)] = rel
    else:
        problems.append(f"{rel}: declares {name} but {doc.relative_to(root)} does not exist. "
                        "Generate it with 'bash tests/drill.sh --capture <bank>' — never by hand")

for qdir in sorted({s.parent.parent for s in scripts}):
    for doc in sorted((qdir / "expected").glob("*")):
        if doc.is_file() and (qdir, doc.name) not in declared:
            problems.append(f"{doc.relative_to(root)}: no check declares it. Delete it, or "
                            "add '# expected: {} <lang>' to the check it belongs to".format(doc.name))

for p in problems:
    print(f"check-expected: {p}")
print(f"check-expected: {len(scripts)} checks — {paired} paired, {optout} declared none, "
      f"{len(problems)} problems")
sys.exit(1 if problems else 0)
PY
