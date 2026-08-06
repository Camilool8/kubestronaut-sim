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

_artifact() {
  [ -n "$3" ] || return 0
  printf '%s %s %s\n%s\n' '---8<--- sim:artifact' "$1" "$2" "$3"
}

show_actual() { _artifact actual "$1" "$2"; }

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
