#!/usr/bin/env bash
# Every `docs:` link a bank shows a candidate opens, through the same proxy the
# candidate's browser uses.
#
# This is not part of the offline suite and cannot be: it needs a running stack
# and the network. It is here because nothing else can catch what it catches —
# an upstream site reorganising its documentation turns a question's reading
# list into a 404 that the bank has no way of noticing, and the candidate finds
# it mid-exam with the clock running. Two of this repo's Gateway API links had
# already moved when it was first run.
#
# Going through docs-proxy rather than straight out to the internet is the
# point: it proves the URL resolves AND that the domain is on the bank's own
# `spec.environment.allowedDomains`. A link to a page nobody can open through
# the allowlist is the same defect as a dead link.
#
#   bash tests/check-docs-links.sh [bank-id ...]     # default: every bank
#
# Exit 0 when every link answers 200. A redirect is reported and does not fail:
# the browser follows it, so the candidate is fine, but the bank is naming a
# page that has moved and should be updated at leisure.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

INSTANCE=${DOCS_LINKS_INSTANCE:-kubestronaut-sim-instance-1-1}
PROXY=${DOCS_LINKS_PROXY:-http://docs-proxy:3128}

if ! docker exec "$INSTANCE" true >/dev/null 2>&1; then
  echo "check-docs-links: ${INSTANCE} is not running — start the stack first (./sim up)" >&2
  exit 1
fi

banks=("$@")
if [ "${#banks[@]}" -eq 0 ]; then
  for f in banks/*/exam.yaml; do
    banks+=("$(basename "$(dirname "$f")")")
  done
fi

fail=0
total=0
moved=0

for bank in "${banks[@]}"; do
  yaml="banks/${bank}/exam.yaml"
  [ -f "$yaml" ] || { echo "check-docs-links: no ${yaml}" >&2; fail=1; continue; }

  urls=$(yq -r '[.spec.questions[]?.docs[]?.url] | unique | .[]' "$yaml" 2>/dev/null)
  [ -n "$urls" ] || { echo "check-docs-links: ${bank} — no docs links"; continue; }

  n=0
  while IFS= read -r url; do
    [ -n "$url" ] || continue
    n=$((n + 1))
    total=$((total + 1))
    read -r code redirect <<<"$(docker exec "$INSTANCE" curl -s -o /dev/null \
      -w '%{http_code} %{redirect_url}' --max-time 25 -x "$PROXY" "$url" 2>/dev/null)"
    case "$code" in
      200) ;;
      30*)
        moved=$((moved + 1))
        echo "MOVED ${bank}: ${url}"
        echo "        now at ${redirect:-an unnamed location} — the browser follows it, the bank should too"
        ;;
      000)
        fail=1
        echo "BLOCKED ${bank}: ${url}" >&2
        echo "        the proxy refused it: the host is not in spec.environment.allowedDomains," >&2
        echo "        so a candidate clicking this link gets nothing at all" >&2
        ;;
      *)
        fail=1
        echo "DEAD  ${bank}: ${url}" >&2
        echo "        answered ${code} — find where the page moved to and update exam.yaml" >&2
        ;;
    esac
  done <<<"$urls"
  echo "check-docs-links: ${bank} — ${n} link(s) checked"
done

if [ "$fail" = "0" ]; then
  echo "check-docs-links: ${total} link(s) resolve through the allowlist${moved:+, ${moved} moved}"
fi
exit $fail
