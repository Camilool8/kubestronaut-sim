# Shared helpers for validate.d checks.
#
# Source it as the first line after `set`:
#
#     . /banks/_lib/checks.sh
#
# `/banks` is already mounted read-only on both instances, and the
# grader's remote command runs from there, so no wiring is needed. The
# `_` prefix matches banks/_charts and keeps this directory out of the
# `banks/*/exam.yaml` glob that discovers banks.
#
# Everything here generalises a pattern the bank already got right
# somewhere. The standard is set by q07/validate.d/30_resources.sh:
# "Quantities are compared by value, not by spelling: 0.1 and 100m are
# the same CPU request, and a candidate who wrote either answered
# correctly." A check that fails a correct answer is worse than no check
# at all — it teaches the candidate something false about Kubernetes and
# costs them points they earned.
#
# Note what is deliberately NOT here: nothing that compares a manifest as
# text. Every Kubernetes assertion in this bank reads the live API object
# through -o jsonpath or -o json | jq, so the API server has already
# normalised field order, indentation and quoting before a check sees
# anything. `limits` before `requests` is byte-identical to the reverse.
# Keep it that way; tests/check-lint.sh enforces it.
#
# The show_* helpers at the bottom are the single place a manifest
# appears as text, and they are the exception that proves the rule: they
# SHOW a document to a candidate who has already lost the points, and
# nothing they emit is ever compared to anything. The grader emits what
# it found and what it wanted; rendering the difference is the client's
# job, and no score depends on it.

# milli <quantity> -> CPU in millicores, empty for empty input.
#   100m -> 100      0.1 -> 100      1 -> 1000
milli() {
  case "$1" in
    *m) printf '%s' "${1%m}" ;;
    "") printf '' ;;
    *) awk -v v="$1" 'BEGIN{printf "%d", v * 1000}' ;;
  esac
}

# mib <quantity> -> memory in MiB, "x" for a unit we do not handle (which
# fails a comparison loudly rather than silently matching).
mib() {
  case "$1" in
    *Mi) printf '%s' "${1%Mi}" ;;
    *Gi) awk -v v="${1%Gi}" 'BEGIN{printf "%d", v * 1024}' ;;
    *Ki) awk -v v="${1%Ki}" 'BEGIN{printf "%d", v / 1024}' ;;
    "") printf '' ;;
    *) printf 'x' ;;
  esac
}

# mode_decimal <octal> -> the decimal the API stores.
#   0400 -> 256
# The API returns defaultMode as decimal; a candidate writes octal. Both
# spellings are the same value.
mode_decimal() { printf '%d' "$(( 8#${1#0} ))" 2>/dev/null || printf 'x'; }

# file_text <path> -> file contents with CRLF and surrounding whitespace
# stripped.
#
# For answer files a candidate types or pastes. A trailing space, a
# trailing newline or a CRLF from an editor is not a wrong answer, and
# `grep -qx` used to score it as one.
file_text() {
  [ -f "$1" ] || { printf ''; return; }
  tr -d '\r' < "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | tr -d '\n'
}

# file_lines_sorted <path> -> non-blank lines, trimmed and sorted.
#
# For "write a list to a file" answers. Compare with same_set rather than
# diff: a diff makes ordering and whitespace part of the answer even when
# the question did not ask for them.
file_lines_sorted() {
  [ -f "$1" ] || { printf ''; return; }
  tr -d '\r' < "$1" \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -v '^$' \
    | sort
}

# same_set <a> <b> -> 0 if the two newline-separated lists hold the same
# members, ignoring order and blank lines.
same_set() {
  [ "$(printf '%s\n' "$1" | grep -v '^$' | sort)" = "$(printf '%s\n' "$2" | grep -v '^$' | sort)" ]
}

# contains_kv <text> <key> <value> -> 0 if text has a `key = value` line,
# with any (or no) spacing around the `=`.
#
# `--from-file` preserves a config file byte for byte, but a candidate who
# retyped `max_connections=512` instead of `max_connections = 512` has the
# same configuration and used to fail.
contains_kv() {
  printf '%s\n' "$1" \
    | sed -e 's/[[:space:]]*=[[:space:]]*/=/' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -qx -- "$2=$3"
}

# contains_pair <text> <key> <value> -> 0 if text has a whitespace-
# separated `key value` line, whatever the run of whitespace between them.
#
# For output a candidate's own program produces. `cpu  42` and `cpu 42`
# are the same two fields, and an adapter that emits either did the job.
contains_pair() {
  printf '%s\n' "$1" \
    | sed -e 's/[[:space:]][[:space:]]*/ /g' -e 's/^ //' -e 's/ $//' \
    | grep -qx -- "$2 $3"   # lint: allow-grep-qx (operating on normalised text)
}

# yaml_api_versions <file> -> the sorted unique apiVersion values in a
# (possibly multi-document) YAML file.
#
# Parsed with yq, never grepped: `apiVersion:  batch/v1` with two spaces
# is the same document, and a check that says otherwise is testing the
# candidate's whitespace.
yaml_api_versions() {
  yq -r '.apiVersion' "$1" 2>/dev/null | grep -v '^null$' | sort -u
}

# semver_ge <a> <b> -> 0 if version a >= version b.
semver_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

# --- Evidence: what the cluster looked like, and what it should have ----
#
# A failed check used to tell a candidate only THAT they were wrong.
# These append a trailer to the check's stdout that the grader splits off
# into the explanation screen's "YOUR CLUSTER STATE" and "EXPECTED"
# panes, plus a prose note. Everything printed before the first sentinel
# is still the message, byte for byte, so a check that calls none of them
# behaves exactly as it did before the protocol existed — which is why
# none of the 75 shipped checks had to be touched.
#
# Call them AFTER the failure message and before `exit 1`:
#
#   [ "$sel" = "app=inventory" ] || {
#     echo "selector is '$sel', want app=inventory"
#     show_actual yaml "$(kubectl -n serpens get svc inventory -o yaml | k8s_clean)"
#     show_expected yaml "/banks/${BANK:-ckad-mock-01}/q19/expected/service.yaml"
#     show_why "The selector matches no Pod, so the Service has no endpoints."
#     exit 1
#   }
#
# The sentinel starts at column 0, which is also the escape hatch: a
# check that must print that exact string as output indents it one space
# and it is ordinary message text again.

# _artifact <kind> <lang> <body> -> the sentinel line and its body, or
# nothing at all when the body is empty. An empty pane on the explanation
# screen says less than no pane; a check that found nothing there should
# say so in show_why.
#
# The sentinel goes through %s rather than into the format string: bash's
# printf reads a format beginning with `-` as options and dies with
# "invalid option", which inside a check is a lost point.
_artifact() {
  [ -n "$3" ] || return 0
  printf '%s %s %s\n%s\n' '---8<--- sim:artifact' "$1" "$2" "$3"
}

# show_actual <lang> <text> -> the "YOUR CLUSTER STATE" pane.
show_actual() { _artifact actual "$1" "$2"; }

# show_expected <lang> <file> -> the "EXPECTED" pane, read from <file>;
# nothing when the file is absent, so a question without one degrades to
# the message it always had.
#
# A file, never an inline string, on purpose. Expected documents live in
# banks/<bank>/<qid>/expected/ and are GENERATED by running the reference
# solution (tests/solutions/<bank>/<qid>.sh) and piping the result
# through k8s_clean — never typed by hand. A hand-written "expected"
# drifts from what the reference solution actually produces and then
# teaches the candidate something false, which is the same failure mode
# as a check that grades spelling.
show_expected() {
  [ -f "$2" ] || return 0
  _artifact expected "$1" "$(cat "$2")"
}

# show_why <text> -> the prose note under the two panes. A sentence or
# two naming the mechanism that failed, not a restatement of the message.
show_why() { _artifact why text "$1"; }

# k8s_clean -> a live object on stdin, minus the server-side fields that
# make `kubectl get -o yaml` unreadable and unstable to compare:
# managedFields, creationTimestamp, resourceVersion, uid, generation,
# status, and the last-applied-configuration annotation. A List is
# cleaned item by item.
#
# For SHOWING an object, never for scoring one. check-lint's get-yaml
# rule stands aside for exactly one shape — a `-o yaml` piped straight
# through here into show_actual or show_expected on the same line — and
# a `-o yaml` captured into a variable still fails the gate.
#
# Running both panes through the same filter is also what makes them
# comparable: yq re-emits each in its own layout, so what survives on
# screen is a real difference and not two spellings of one object.
#
# Empty output when the input is not YAML, or when yq is missing. A wall
# of managedFields is worse evidence than none.
k8s_clean() {
  yq '(., (select(has("items")) | .items[])) |= (
        del(.metadata.managedFields, .metadata.creationTimestamp, .metadata.resourceVersion,
            .metadata.uid, .metadata.generation, .status,
            .metadata.annotations."kubectl.kubernetes.io/last-applied-configuration")
        | del(.metadata.annotations | select(length == 0))
        | del(.metadata | select(length == 0)))' - 2>/dev/null
}
