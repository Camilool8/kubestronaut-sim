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
