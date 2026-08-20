#!/usr/bin/env bash
# points: 2
# desc: /opt/course/11/shipment-spec holds the explain output for the Shipment's spec, not for the whole resource
set -uo pipefail
. /banks/_lib/checks.sh

F=/opt/course/11/shipment-spec

[ -f "$F" ] || {
  echo "$F does not exist"
  show_actual text "$(ls -l /opt/course/11/ 2>/dev/null)"
  show_why "The explain output is a deliverable of this question rather than something to read and discard: it prints to stdout and has to be redirected to that exact path. The pane above is everything /opt/course/11 holds."
  exit 1
}

body=$(cat "$F" 2>/dev/null)
mentions() { printf '%s' "$body" | grep -qF -- "$1"; }

# explain's layout is kubectl's, not the candidate's, and it has changed shape
# between releases - so this asks what the output is ABOUT, never what it looks
# like. Every field of spec is named, and none of them appears anywhere in the
# schema except under spec.
missing=$(for f in destination weightKg priority carrier; do
  mentions "$f" || printf '%s ' "$f"
done)
missing=${missing% }

# The one thing kubectl explain prints for a whole resource and never for a
# field of one: the object's own top-level fields. Their presence means the
# command was pointed one level too high.
whole_resource=$(for f in apiVersion metadata; do
  mentions "$f" && printf '%s ' "$f"
done)
whole_resource=${whole_resource% }

evidence() {
  show_actual text "$body"
  show_why "$1"
}

describes_the_fields() { [ -z "$missing" ]; }
is_the_spec() { [ -z "$whole_resource" ] && mentions Shipment; }

# Two ways to be at the wrong level, and they need different sentences: an
# explain of the whole resource, or an output that is not an explain of this
# resource at all.
if [ -n "$whole_resource" ]; then
  level="the output also carries the resource's own top-level fields ($whole_resource), so it describes a Shipment rather than a Shipment's spec"
else
  level="the output never names the Shipment resource, so it did not come from an explain of it"
fi

crit 1 "names every field of the Shipment's spec" \
  "the output does not mention: ${missing:-nothing}" \
  "kubectl explain reads the schema the CRD published, so it answers for a custom resource exactly as it does for a built-in one — and for this Shipment that schema names four fields under spec. An output missing them is an output about something else: explain descends a dotted path, and only shipment.spec reaches the fields themselves." \
  -- describes_the_fields

crit 1 "and is the spec's own entry rather than the whole resource" \
  "$level" \
  "kubectl explain shipment prints what every Kubernetes object has — apiVersion, kind, metadata, spec, status — and stops there, describing spec in one sentence without ever listing what goes inside it. That is the level above the one this asks for. Appending .spec walks into the field, and from there .spec.carrier walks in again: the path is how far down the schema you are being shown." \
  -- is_the_spec

crit_all_passed || evidence "$(crit_why)"
report "shipment-spec holds the spec's explain output"
