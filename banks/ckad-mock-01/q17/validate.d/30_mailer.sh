#!/usr/bin/env bash
# points: 3
# desc: the unpullable image was recorded and the mailer Deployment repaired
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n corvus get deploy 2>/dev/null; echo; kubectl -n corvus get pod 2>/dev/null)"
  show_why "$1"
}

got=$(cat /opt/course/17/bad-image 2>/dev/null | tr -d '[:space:]')
[ "$got" = "nginx:0.0.0-corvus-nonexistent" ] || {
  echo "/opt/course/17/bad-image contains '$got', want nginx:0.0.0-corvus-nonexistent"
  show_actual text "$(cat /opt/course/17/bad-image 2>/dev/null)"
  show_why "The image a Deployment is asking for is on its Pod template, and reading it from there is exact — transcribing it out of the event text in describe is where a typo comes from. It also has to be recorded BEFORE the Deployment is repaired, since the repair is what removes it. The full reference means the tag as well as the name."
  exit 1
}

img=$(kubectl -n corvus get deploy mailer \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="mailer")].image}' 2>/dev/null)
[ "$img" = "nginx:1.29-alpine" ] || {
  echo "mailer image is '$img', want nginx:1.29-alpine"
  evidence "ImagePullBackOff means no container was ever created, so there is nothing to log and describe is the tool that carries the reason. The repair is the image on the Pod template — which starts a fresh rollout, because the template is what a ReplicaSet is created from."
  exit 1
}

ready=$(kubectl -n corvus get deploy mailer -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "1" ] || {
  echo "mailer readyReplicas is '$ready', want 1"
  evidence "The image is right but no Pod is ready yet. A Deployment whose image was corrected keeps the old failing ReplicaSet at zero and rolls a new one out, so this is either that rollout still in flight or a second problem behind the first."
  exit 1
}

fe=$(kubectl -n corvus get deploy frontend -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$fe" = "1" ] && echo "mailer fixed, frontend untouched" || {
  echo "frontend was supposed to be left alone (readyReplicas='$fe')"
  evidence "The healthy workload was a control, not a casualty. Two of the three things in this Namespace were broken and one was not, and knowing which is which before changing anything is most of the exercise."
  exit 1
}
