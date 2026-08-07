milli() {
  case "$1" in
    *m) printf '%s' "${1%m}" ;;
    "") printf '' ;;
    *) awk -v v="$1" 'BEGIN{printf "%d", v * 1000}' ;;
  esac
}

mib() {
  case "$1" in
    *Mi) printf '%s' "${1%Mi}" ;;
    *Gi) awk -v v="${1%Gi}" 'BEGIN{printf "%d", v * 1024}' ;;
    *Ki) awk -v v="${1%Ki}" 'BEGIN{printf "%d", v / 1024}' ;;
    "") printf '' ;;
    *) printf 'x' ;;
  esac
}

mode_decimal() { printf '%d' "$(( 8#${1#0} ))" 2>/dev/null || printf 'x'; }

file_text() {
  [ -f "$1" ] || { printf ''; return; }
  tr -d '\r' < "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | tr -d '\n'
}

file_lines_sorted() {
  [ -f "$1" ] || { printf ''; return; }
  tr -d '\r' < "$1" \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -v '^$' \
    | sort
}

# Does a whitespace-separated list of names contain this exact name?
#
# Use this rather than grep -w for anything kubectl printed. A hyphen is not a
# word character, so grep -w 'agent' matches 'vault-agent' and grep -w
# 'app-tuning' matches 'my-app-tuning' — the second scores a wrong answer as
# correct. Kubernetes names cannot contain glob characters, so splitting on IFS
# is safe here.
has_name() {
  local want=$2 n
  for n in ${1-}; do
    [ "$n" = "$want" ] && return 0
  done
  return 1
}

same_set() {
  [ "$(printf '%s\n' "$1" | grep -v '^$' | sort)" = "$(printf '%s\n' "$2" | grep -v '^$' | sort)" ]
}

contains_kv() {
  printf '%s\n' "$1" \
    | sed -e 's/[[:space:]]*=[[:space:]]*/=/' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -qx -- "$2=$3"
}

contains_pair() {
  printf '%s\n' "$1" \
    | sed -e 's/[[:space:]][[:space:]]*/ /g' -e 's/^ //' -e 's/ $//' \
    | grep -qx -- "$2 $3"   # lint: allow-grep-qx (operating on normalised text)
}

yaml_api_versions() {
  yq -r '.apiVersion' "$1" 2>/dev/null | grep -v '^null$' | sort -u
}

semver_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

# What a lookup found when it found nothing. A name that does not match — a
# container called vault-agent where the question asked for agent — makes
# kubectl and jq alike return nothing, and staying silent then left the
# candidate reading "runAsUser='', want 10001" with no way to see why. Say so
# instead.
ARTIFACT_EMPTY='none — the object, container or field named here does not exist'

_artifact() {
  local body=$3
  case "$(printf '%s' "$body" | tr -d '[:space:]')" in
    ''|null) body=$ARTIFACT_EMPTY; set -- "$1" text "$body" ;;
  esac
  printf '%s %s %s\n%s\n' '---8<--- sim:artifact' "$1" "$2" "$body"
}

show_actual() { _artifact actual "$1" "${2-}"; }

# The names that DO exist, for a message that can name the real problem:
#   no container named 'agent' (found: vault-agent)
# Takes the raw jsonpath list — '{.spec.containers[*].name}' and friends.
name_list() {
  local names
  names=$(printf '%s' "${1-}" | tr -s '[:space:]' ' ' | sed -e 's/^ //' -e 's/ $//')
  [ -n "$names" ] || { printf 'none'; return; }
  printf '%s' "$names" | sed 's/ /, /g'
}

show_expected() {
  [ -f "$2" ] || return 0
  _artifact expected "$1" "$(cat "$2")"
}

show_why() { _artifact why text "$1"; }

k8s_clean() {
  yq '(., (select(has("items")) | .items[])) |= (
        del(.metadata.managedFields, .metadata.creationTimestamp, .metadata.resourceVersion,
            .metadata.uid, .metadata.generation, .status,
            .metadata.annotations."kubectl.kubernetes.io/last-applied-configuration")
        | del(.spec.clusterIP  | select(. != "None"))
        | del(.spec.clusterIPs | select(.[0] != "None"))
        | del(.spec.internalTrafficPolicy | select(. == "Cluster"))
        | del(.spec.externalTrafficPolicy | select(. == "Cluster"))
        | del(.spec.sessionAffinity       | select(. == "None"))
        | del(.spec.ipFamilyPolicy        | select(. == "SingleStack"))
        | del(.spec.ipFamilies            | select(length == 1 and .[0] == "IPv4"))
        | del(.metadata.annotations | select(length == 0))
        | del(.metadata | select(length == 0)))' - 2>/dev/null
}
