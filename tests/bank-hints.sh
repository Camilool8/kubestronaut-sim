#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import pathlib
import re
import sys

HEADING = re.compile(r"(?m)^##\s+Hint\s+(\d+)\s*$")
WANT_TIERS = 2
OVERLAP = 120

failures = []
checked = 0

for exam in sorted(pathlib.Path("banks").glob("*/exam.yaml")):
    bank = exam.parent
    hint_files = sorted(bank.glob("q*/hints.md"))
    if not hint_files:
        print(f"{bank.name}: no hints (fine — hints are optional)")
        continue

    questions = sorted(p for p in bank.glob("q*") if p.is_dir())
    missing = [q.name for q in questions if not (q / "hints.md").exists()]
    if missing:
        failures.append(f"{bank.name}: no hints.md for {', '.join(missing)}")

    for hf in hint_files:
        checked += 1
        text = hf.read_text()
        headings = HEADING.findall(text)

        if len(headings) != WANT_TIERS:
            failures.append(f"{hf}: {len(headings)} tiers, want {WANT_TIERS}")
            continue
        if headings != [str(i + 1) for i in range(WANT_TIERS)]:
            failures.append(f"{hf}: tiers numbered {headings}, want 1..{WANT_TIERS}")

        locs = [m.span() for m in HEADING.finditer(text)]
        for i, (_, end) in enumerate(locs):
            stop = locs[i + 1][0] if i + 1 < len(locs) else len(text)
            if not text[end:stop].strip():
                failures.append(f"{hf}: hint {i + 1} is empty")

        sol = hf.parent / "solution.md"
        if sol.exists():
            body = " ".join(text.split())
            solution = " ".join(sol.read_text().split())
            for i in range(0, max(0, len(body) - OVERLAP), 20):
                chunk = body[i:i + OVERLAP]
                if chunk in solution:
                    failures.append(
                        f"{hf}: shares {OVERLAP}+ characters with solution.md "
                        f"— that is the answer, not a hint"
                    )
                    break

for f in failures:
    print(f"FAIL  {f}")

print()
print(f"bank-hints: {checked} hint files, {len(failures)} failures")
sys.exit(1 if failures else 0)

PY
