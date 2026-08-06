#!/bin/sh
set -eu
mkdir -p /run/banks
for f in /banks/*/exam.yaml; do
  [ -f "$f" ] || continue
  id=$(basename "$(dirname "$f")")
  yq -o=json '.' "$f" > "/run/banks/${id}.json" || echo "conductor: skipping unparseable ${f}" >&2
done
[ -f /banks/catalog.yaml ] && yq -o=json '.' /banks/catalog.yaml > /run/banks/_catalog.json
exec /conductor
