#!/usr/bin/env bash
# _aux_kind_create against a stub `kind` on PATH: the real one needs a dockerd.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
. banks/_lib/aux-cluster.sh

PASS=0
FAIL=0

ok() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1));
  else echo "FAIL: $1 — got '$2', want '$3'"; FAIL=$((FAIL+1)); fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin"

# Fails its first $KIND_FAILS creates the way kind v0.32 does when kubeadm init
# loses the race against a slow API server: kind's ERROR line, kubeadm's own
# error line, then a Go stack trace long enough to push both out of a 500-char
# tail.
cat > "$tmp/bin/kind" <<'EOF'
#!/usr/bin/env bash
echo "$1" >> "$KIND_CALLS"
[ "$1" = create ] || exit 0
n=$(grep -c '^create$' "$KIND_CALLS")
if [ "$n" -le "$KIND_FAILS" ]; then
  echo "ERROR: failed to create cluster: failed to init node with kubeadm: exit status 1"
  echo "error: error execution phase wait-control-plane: cannot obtain client without bootstrap"
  for _ in $(seq 1 20); do
    printf 'github.com/spf13/cobra.(*Command).ExecuteC\n\tgithub.com/spf13/cobra@v1.10.0/command.go:1148\n'
  done
  exit 1
fi
echo "Creating cluster ... done"
EOF
chmod +x "$tmp/bin/kind"

run() {
  : > "$tmp/calls"
  KIND_FAILS=$1 KIND_CALLS="$tmp/calls" PATH="$tmp/bin:$PATH" \
    _aux_kind_create aux-test --config /dev/null > "$tmp/out" 2>&1
  echo $?
}
creates() { grep -c '^create$' "$tmp/calls"; }
deletes() { grep -c '^delete$' "$tmp/calls"; }

ok "first try: succeeds"        "$(run 0)" "0"
ok "first try: one create"      "$(creates)" "1"
ok "first try: nothing deleted" "$(deletes)" "0"

ok "one failure: succeeds on the retry" "$(run 1)" "0"
ok "one failure: two creates"           "$(creates)" "2"
ok "one failure: the failed one is deleted first" "$(deletes)" "1"

ok "two failures: gives up"         "$(run 2)" "1"
ok "two failures: no third attempt" "$(creates)" "2"
# The conductor reports the last 500 characters of a failed setup.sh. kubeadm's
# reason has to be inside them, not above a stack trace.
last=$(tail -c 500 "$tmp/out")
case "$last" in
  *"error execution phase wait-control-plane"*) PASS=$((PASS+1)) ;;
  *) echo "FAIL: two failures: kubeadm's error is not in the reported tail"; FAIL=$((FAIL+1)) ;;
esac

echo "aux-cluster: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
