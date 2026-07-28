#!/usr/bin/env bash
set -euo pipefail
#
# This solution is deliberately written in the sloppier of two correct
# spellings, and that is the point.
#
# smoke.sh already asserts that a fully solved environment scores exactly
# 100%. Answering q01 the way the checks were written proves nothing
# about tolerance; answering it the way a real candidate might — `1000m`
# instead of `1`, a trailing space from a paste, a CR from an editor —
# turns that standing assertion into the proof that the normalisers are
# real. If `milli()`, `file_lines_sorted` or `same_set` ever regress,
# this question stops scoring and the suite says so.
#
# Both spellings are correct Kubernetes. Do not "tidy" this file.
kubectl create ns aurora-staging --dry-run=client -o yaml | kubectl apply -f -
kubectl label ns aurora-staging team=aurora --overwrite

# 1000m == 1 CPU. resource.Quantity keeps the spelling it was given, so
# this is exactly what a string-matching check scored as a wrong answer.
kubectl -n aurora-staging create quota staging-quota --hard=pods=5,requests.cpu=1000m \
  --dry-run=client -o yaml | kubectl apply -f -

# Trailing whitespace on the first line, a CR on the second: what an
# editor or a paste leaves behind. The names and their order are correct.
kubectl get ns -l team=aurora -o name | cut -d/ -f2 | sort \
  | sed -e '1s/$/   /' -e '2s/$/\r/' \
  > /opt/course/1/aurora-namespaces
