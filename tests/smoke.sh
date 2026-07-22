#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "SMOKE FAIL: $1"; ./sim down; exit 1; }

./sim up
docker compose exec ckad-1 su - candidate -c 'kubectl get nodes --no-headers' | tee /tmp/nodes.txt
[ "$(grep -c ' Ready ' /tmp/nodes.txt)" -eq 2 ] || fail "expected 2 Ready nodes"

./sim grade | tee /tmp/grade0.txt
read -r _ e0 t0 _ < <(grep '^RESULT ' /tmp/grade0.txt)
[ "$e0" = "0" ] || fail "fresh env should score 0, got ${e0}"

docker compose exec ckad-1 su - candidate -c 'bash /tests/solutions/q01.sh'
docker compose exec ckad-1 su - candidate -c 'bash /tests/solutions/q02.sh'
docker compose exec ckad-2 su - candidate -c 'bash /tests/solutions/q03.sh'

./sim grade | tee /tmp/grade1.txt
read -r _ e1 t1 _ < <(grep '^RESULT ' /tmp/grade1.txt)
[ "$e1" = "$t1" ] || fail "solved env should score ${t1}/${t1}, got ${e1}/${t1}"

./sim down
echo "SMOKE PASS (${e1}/${t1} after solutions, 0/${t0} before)"
