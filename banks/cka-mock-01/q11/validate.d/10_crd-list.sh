#!/usr/bin/env bash
# points: 2
# desc: /opt/course/11/crds names every CustomResourceDefinition of group logistics.sim.dev and nothing else
# expected: none — the file is graded against a hardcoded list of the three
#           CRD names this group ships (spelled out on purpose, so a
#           candidate who deleted them is compared against something real
#           rather than an empty document that would agree with an empty
#           file), plus a survey of everything else this cluster's API
#           serves. Both are live cluster surveys, not a shape the
#           candidate authored.
set -uo pipefail
. /banks/_lib/checks.sh

F=/opt/course/11/crds
GROUP=logistics.sim.dev

[ -f "$F" ] || {
  echo "$F does not exist"
  show_actual text "$(ls -l /opt/course/11/ 2>/dev/null)"
  show_why "This part of the answer is a file on the instance rather than a command run once: the names have to end up at that exact path, so the listing has to be redirected there. The pane above is everything /opt/course/11 holds."
  exit 1
}

# kubectl -o name prints customresourcedefinition.apiextensions.k8s.io/<name>,
# which is the same answer wearing kubectl's own resource/name form, so the type
# prefix comes off before the sets are compared. Anything else that shares the
# line - a CREATED AT column, a table heading - has no slash in front of it,
# survives this and is reported as an extra, which is what "the name alone"
# means.
listed=$(file_lines_sorted "$F" | sed 's#^[^/]*/##')

# Spelled out rather than read back from the cluster on purpose: derived from a
# live listing, a candidate who deleted the CRDs would be compared against an
# empty set, and an empty file would then agree with it.
want="carriers.${GROUP}
depots.${GROUP}
shipments.${GROUP}"

missing=$(for n in $want; do has_name "$listed" "$n" || printf '%s | ' "$n"; done)
missing=${missing% | }

# A line the group does not account for. Joined with a separator rather than a
# space because the lines that get here are the ones carrying something else —
# a CREATED AT column, a heading — and space-joining them would read as one.
extra=$(printf '%s\n' "$listed" | while IFS= read -r line; do
  [ -n "$line" ] || continue
  has_name "$want" "$line" || printf '%s | ' "$line"
done)
extra=${extra% | }

evidence() {
  show_actual text "$(cat "$F" 2>/dev/null)"
  show_why "$1"
}

names_the_group() { [ -z "$missing" ]; }
nothing_else() { [ -z "$missing" ] && [ -z "$extra" ]; }

# Finding the group's CRDs and listing only those are two different pieces of
# work - one is a lookup, the other is a filter - and they fail separately, so
# they are scored separately.
crit 1 "names every CRD of ${GROUP}" \
  "the file does not name: ${missing:-nothing}" \
  "A CRD's name is always its plural joined to its group, so every resource this group serves appears in kubectl get crd under a name ending in .${GROUP}. There are three of them, and the group is what they have in common — kubectl api-resources --api-group=${GROUP} answers the same question from the other side, listing what the API now serves rather than the objects that taught it to." \
  -- names_the_group

crit 1 "and nothing that is not in that group" \
  "against the 3 CRDs of the group the file misses ${missing:-none} and adds ${extra:-none}" \
  "This cluster serves plenty of custom resources that have nothing to do with logistics — the Gateway API controller alone installs several — so an unfiltered kubectl get crd is a much longer answer to a different question. The line has to be the name on its own too: a copied table brings a CREATED AT column and a heading along with it, and neither is a CRD name." \
  -- nothing_else

crit_all_passed || evidence "$(crit_why)"
report "crds lists the ${GROUP} CRDs"
