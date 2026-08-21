#!/usr/bin/env bash
# points: 2
# desc: /opt/course/34/cache-values.yaml overrides the replica count and the tag
# expected: cache-values.json json
set -uo pipefail
. /banks/_lib/checks.sh
F=/opt/course/34/cache-values.yaml

# Only the two keys this check grades — a key the chart does not use is not
# an error, per its own reasoning below, so a whole-file pane would mark a
# legitimately extra key as if it were wrong.
snapshot() {
  yq -o=json . "$F" 2>/dev/null \
    | jq -S '{replicaCount: (.replicaCount // null), image: {tag: (.image.tag // null)}}' 2>/dev/null
}

evidence() {
  show_pair json cache-values.json
  show_why "$1"
}

[ -f "$F" ] || {
  echo "$F does not exist"
  show_actual text "$(ls -l /opt/course/34/ 2>/dev/null)"
  show_why "The file is the deliverable this question is about, not scaffolding for it. A release installed with --set reaches the same cluster and leaves nothing behind to review, nothing to commit, and nothing to hand the next upgrade — which is why the path is graded on its own."
  exit 1
}

reps=$(yq -r '.replicaCount // ""' "$F" 2>/dev/null)
tag=$(yq -r '.image.tag // ""' "$F" 2>/dev/null)

crit 1 "sets replicaCount to 3" \
  "replicaCount in the values file is '$reps', want 3" \
  "The keys in a values file are the chart's own, spelled exactly as its values.yaml spells them — 'helm show values sim/sim-cache' prints them. A key the chart does not use is not an error: Helm accepts it, no template reads it, and the release comes out with the defaults." \
  -- [ "$reps" = "3" ]

crit 1 "sets image.tag to 1.27-alpine, nested under image" \
  "image.tag in the values file is '$tag', want 1.27-alpine" \
  "The tag lives inside the image map, so it is two lines in a file rather than the one dotted path --set would need. Writing it flat as 'image.tag: 1.27-alpine' creates a top-level key with a dot in its name, which no template ever reads. Leaving repository and pullPolicy out is deliberate and correct: Helm merges a values file into the chart's defaults key by key, so anything absent keeps coming from the chart." \
  -- [ "$tag" = "1.27-alpine" ]

crit_all_passed || evidence "$(crit_why)"
report "values file overrides replicaCount and image.tag"
