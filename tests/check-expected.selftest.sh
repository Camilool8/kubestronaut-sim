#!/usr/bin/env bash
# Fixture bank: one check per rule the gate enforces, each broken on purpose.
# A gate nobody has watched fail is a gate that asserts nothing.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

PASS=0; FAIL=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

mk() { # qid script body...
  mkdir -p "$tmp/banks/cka-mock-01/$1/validate.d"
  printf '%s\n' "${@:3}" > "$tmp/banks/cka-mock-01/$1/validate.d/$2"
}

expect_fail() { # description, grep pattern
  local out; out=$(bash tests/check-expected.sh "$tmp" 2>&1)
  if printf '%s' "$out" | grep -q "$2"; then PASS=$((PASS+1));
  else echo "FAIL: $1 — gate did not report it"; echo "$out"; FAIL=$((FAIL+1)); fi
  rm -rf "$tmp/banks"
}

mk q01 10_a.sh '#!/usr/bin/env bash' '# points: 1' '# desc: x'
expect_fail "rule 1: no declaration at all" "no '# expected:' declaration"

mk q01 10_a.sh '#!/usr/bin/env bash' '# expected: none' 'true'
expect_fail "rule 2: none with no reason" "gives no reason"

mk q01 10_a.sh '#!/usr/bin/env bash' '# expected: svc.yaml yaml' 'true'
expect_fail "rule 3: declared but no snapshot" "declares svc.yaml but defines no snapshot"

mk q01 10_a.sh '#!/usr/bin/env bash' '# expected: svc.yaml yaml' 'snapshot() { true; }' 'true'
expect_fail "rule 3: declared but never paired" "never calls show_pair"

mk q01 10_a.sh '#!/usr/bin/env bash' '# expected: svc.yaml yaml' 'snapshot() { true; }' 'show_pair json svc.yaml'
expect_fail "rule 3: lang disagrees with the header" "declares lang 'yaml'"

mk q01 10_a.sh '#!/usr/bin/env bash' '# expected: none — a reading, not a document' 'snapshot() { true; }'
expect_fail "rule 3: opted out but still defines a snapshot" "opts out but defines snapshot"

mk q01 10_a.sh '#!/usr/bin/env bash' '# expected: svc.yaml yaml' 'snapshot() { true; }' 'show_pair yaml svc.yaml'
expect_fail "rule 4: declared document missing" "does not exist"

mk q01 10_a.sh '#!/usr/bin/env bash' '# expected: none — a reading, not a document' 'true'
mkdir -p "$tmp/banks/cka-mock-01/q01/expected"; printf 'x\n' > "$tmp/banks/cka-mock-01/q01/expected/orphan.yaml"
expect_fail "rule 5: orphan document" "no check declares it"

# And the shape that must PASS.
mk q01 10_a.sh '#!/usr/bin/env bash' '# expected: svc.yaml yaml' 'snapshot() { true; }' 'show_pair yaml svc.yaml'
mkdir -p "$tmp/banks/cka-mock-01/q01/expected"; printf 'kind: Service\n' > "$tmp/banks/cka-mock-01/q01/expected/svc.yaml"
if bash tests/check-expected.sh "$tmp" >/dev/null 2>&1; then PASS=$((PASS+1));
else echo "FAIL: a correctly paired check did not pass the gate"; FAIL=$((FAIL+1)); fi

echo "check-expected selftest: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
