#!/usr/bin/env bash
# points: 3
# desc: the unpullable image was recorded and the mailer Deployment repaired
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n corvus get deploy 2>/dev/null; echo; kubectl -n corvus get pod 2>/dev/null)"
  show_why "$1"
}

# The question rules this one out: frontend was the workload to leave alone, so
# breaking it is not a partial answer to anything.
fe=$(kubectl -n corvus get deploy frontend -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$fe" = "1" ] || {
  echo "frontend was supposed to be left alone (readyReplicas='$fe')"
  evidence "The healthy workload was a control, not a casualty. Two of the three things in this Namespace were broken and one was not, and knowing which is which before changing anything is most of the exercise."
  exit 1
}

got=$(cat /opt/course/17/bad-image 2>/dev/null | tr -d '[:space:]')
img=$(kubectl -n corvus get deploy mailer \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="mailer")].image}' 2>/dev/null)
ready=$(kubectl -n corvus get deploy mailer -o jsonpath='{.status.readyReplicas}' 2>/dev/null)

file_pane() {
  show_actual text "$(cat /opt/course/17/bad-image 2>/dev/null)"
  show_why "$1"
}
pane=''

crit 1 "the unpullable image was recorded first" \
  "/opt/course/17/bad-image contains '$got', want nginx:0.0.0-corvus-nonexistent" \
  "The image a Deployment is asking for is on its Pod template, and reading it from there is exact — transcribing it out of the event text in describe is where a typo comes from. It also has to be recorded BEFORE the Deployment is repaired, since the repair is what removes it. The full reference means the tag as well as the name." \
  -- [ "$got" = "nginx:0.0.0-corvus-nonexistent" ] || pane=${pane:-file_pane}

crit 1 "mailer runs a pullable image" \
  "mailer image is '$img', want nginx:1.29-alpine" \
  "ImagePullBackOff means no container was ever created, so there is nothing to log and describe is the tool that carries the reason. The repair is the image on the Pod template — which starts a fresh rollout, because the template is what a ReplicaSet is created from." \
  -- [ "$img" = "nginx:1.29-alpine" ] || pane=${pane:-evidence}

crit 1 "mailer has 1 ready replica" \
  "mailer readyReplicas is '$ready', want 1" \
  "The image may be right while no Pod is ready yet. A Deployment whose image was corrected keeps the old failing ReplicaSet at zero and rolls a new one out, so this is either that rollout still in flight or a second problem behind the first." \
  -- [ "$ready" = "1" ] || pane=${pane:-evidence}

crit_all_passed || "${pane:-evidence}" "$(crit_why)"
report "mailer fixed, frontend untouched"
