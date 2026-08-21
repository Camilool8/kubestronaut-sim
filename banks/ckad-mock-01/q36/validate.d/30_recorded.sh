#!/usr/bin/env bash
# points: 1
# desc: the response body was saved on the instance
# expected: catalog-check.txt text
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  cat /opt/course/36/catalog-check 2>/dev/null
}

evidence() {
  show_pair text catalog-check.txt
  show_why "$1"
}

got=$(cat /opt/course/36/catalog-check 2>/dev/null | tr -d '[:space:]')
[ "$got" = "catalog-mensa" ] && echo "response recorded" || {
  echo "/opt/course/36/catalog-check contains '$got', want 'catalog-mensa'"
  evidence "This records what the alias ANSWERED, so it can only be captured once the request really crosses into mensa — the catalog replies with a single word naming itself. An empty file is the request having failed, and a file full of escape characters is a TTY having been allocated for a command whose output was being redirected to a file."
  exit 1
}
