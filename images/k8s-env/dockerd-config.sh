#!/usr/bin/env bash
# The inner dockerd's address plan. Generated at boot rather than baked into
# the image, because the one address it must stay clear of is only known at
# run time: the upstream DNS server this container forwards its lookups to.
#
# Every inner network is a connected route in k8s-env's own network namespace,
# and so is the default bridge, whose gateway Docker puts at 172.17.0.1 unless
# told otherwise. A host whose Docker daemon resolves through a stub on its own
# docker0 ("dns": ["172.17.0.1"] — Omarchy's default, and the usual recipe for
# systemd-resolved) hands that same address to this container as its upstream.
# In here it is a local address with nothing listening on :53, so every lookup
# from k8s-env, and from the kind nodes that resolve through it, came back
# SERVFAIL. Nothing at boot noticed: every image the banks need is preloaded
# from an archive, so the first lookup that mattered was a candidate's
# `kubectl run --image=nginx` sitting in ErrImagePull.
#
# start.sh sources this under bash, but it is kept to what the image's ash
# runs too, and it refuses to print an empty pool: dockerd reads [] as "use
# the defaults", 172.17.0.0/16 included — the very collision this prevents.
# Sourced into ash, the first draft's bashisms produced exactly that, silently.
#
# So: no default bridge at all — nothing in here uses it; kind puts its nodes
# on its own `kind` network — and an address pool that leaves out 172.17.0.0/16
# and every /16 an upstream DNS server lives in.

# The IPv4 upstreams, one per line. A Pod's resolv.conf names them directly.
# Docker's names only its embedded 127.0.0.11 and records the real ones in a
# comment: "# ExtServers: [172.17.0.1 host(127.0.0.53)]". The host(...) form is
# a loopback resolver Docker queries from the host's own namespace, which no
# network in here can shadow, so the IPv4 filter dropping it is correct.
upstream_dns() {
  sed -nE -e 's/^nameserver[[:space:]]+([^[:space:]]+).*/\1/p' \
          -e 's/^# ExtServers: \[(.*)\]$/\1/p' "${1:-/etc/resolv.conf}" \
    | tr ' ' '\n' \
    | grep -E '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' \
    | grep -v '^127\.' || true
}

# daemon.json for the inner dockerd, on stdout. The pool is the 172.18-172.31
# part of Docker's own default, one /16 per network, so node addresses look
# the way they always have.
dockerd_config() {
  local skip=" 172.17 " ns n pools=""
  for ns in $(upstream_dns "${1:-/etc/resolv.conf}"); do
    skip="${skip}${ns%.*.*} "
  done
  for n in $(seq 18 31); do
    case "$skip" in *" 172.${n} "*) continue ;; esac
    pools="${pools}${pools:+,}{\"base\":\"172.${n}.0.0/16\",\"size\":16}"
  done
  if [ -z "$pools" ]; then
    echo "dockerd_config: every candidate /16 holds an upstream DNS server" >&2
    return 1
  fi
  printf '{"bridge":"none","default-address-pools":[%s]}\n' "$pools"
}

# Upstreams that already route into an inner network. The pool keeps new
# networks clear, but the dind volume outlives an image upgrade, and a `kind`
# network created before this file existed keeps the subnet it was given.
shadowed_dns() {
  local ns
  for ns in $(upstream_dns "${1:-/etc/resolv.conf}"); do
    case "$(ip route get "$ns" 2>/dev/null)" in
      local\ *|*" dev br-"*) echo "$ns" ;;
    esac
  done
}
