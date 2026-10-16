#!/usr/bin/env bash
# The inner dockerd's address plan. Generated at boot rather than baked into
# the image, because what it must stay clear of is only known at run time: the
# upstream DNS server this container forwards its lookups to, and the networks
# this container itself sits on.
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
# The pool is in 10.0.0.0/8 for a second reason: the outer Docker numbers the
# compose networks this container sits on from its own defaults, 172.17-172.31
# and 192.168, and it does not hand them the same subnets every time. A `kind`
# network carved from those same defaults is kept in the dind volume across
# `./sim down` / `./sim up`, while the compose networks are recreated — and the
# day examnet came back as 172.19.0.0/16, the subnet `kind` already held, the
# outer route won, the API server's published port forwarded out of the wrong
# interface, and the resumed cluster never answered. The candidates below stay
# clear of everything else that uses 10/8 near here: kind's pod (10.244) and
# Service (10.96/12) ranges, k3s (10.42, 10.43), podman (10.88, 10.89), q04's
# dead address (10.255.255.254), and the low ranges cloud CNIs start from.
#
# start.sh sources this under bash, but it is kept to what the image's ash
# runs too, and it refuses to print an empty pool: dockerd reads [] as "use
# the defaults", 172.17.0.0/16 included — the very collision this prevents.
# Sourced into ash, the first draft's bashisms produced exactly that, silently.
#
# So: no default bridge at all — nothing in here uses it; kind puts its nodes
# on its own `kind` network — and one /16 from the candidates, split into /24
# networks, that holds no upstream DNS server and none of this container's own
# addresses.

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

# daemon.json for the inner dockerd, on stdout. $1 is the resolv.conf to read
# the upstreams from; the rest are this container's own IPv4 addresses, with or
# without a prefix length.
dockerd_config() {
  local resolv=${1:-/etc/resolv.conf} skip=" " a n
  [ $# -gt 0 ] && shift
  for a in $(upstream_dns "$resolv") "$@"; do
    a=${a%%/*}
    skip="${skip}${a%.*.*} "
  done
  for n in 61 62 63 64 65 66 67; do
    case "$skip" in *" 10.${n} "*) continue ;; esac
    printf '{"bridge":"none","default-address-pools":[{"base":"10.%s.0.0/16","size":24}]}\n' "$n"
    return 0
  done
  echo "dockerd_config: every candidate range holds an upstream DNS server or one of this container's own addresses" >&2
  return 1
}

# Why the `kind` network kept from an earlier boot cannot be used from here, on
# stdout, or nothing when it can (or there is none). The pool above keeps every
# new network clear, but the dind volume outlives both an image upgrade and the
# compose networks around it, and a kept network has its subnet for good.
# Either fault leaves the cluster on it unreachable or unable to resolve
# anything, and neither is visible until a candidate is already in the exam.
kind_network_unusable() {
  local id subnet probe dev bridge ns
  id=$(docker network inspect -f '{{.Id}}' kind 2>/dev/null) || return 0
  subnet=$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' kind \
    | tr ' ' '\n' | grep -v ':' | grep . | head -1) || true
  [ -n "$subnet" ] || return 0
  bridge="br-$(printf '%s' "$id" | cut -c1-12)"

  # The address kind gives its first node. Another interface with an equal or
  # narrower route to it takes the traffic, and only the lookup can tell.
  probe=${subnet%%/*}
  probe="${probe%.*}.2"
  dev=$(ip route get "$probe" 2>/dev/null | sed -n 's/.* dev \([^ ]*\).*/\1/p' | head -1)
  if [ "$dev" != "$bridge" ]; then
    echo "its subnet ${subnet} is also routed to ${dev:-nowhere}"
    return 0
  fi

  for ns in $(upstream_dns "${1:-/etc/resolv.conf}"); do
    case "$(ip route get "$ns" 2>/dev/null)" in
      local\ *|*" dev ${bridge} "*)
        echo "it covers the upstream DNS server ${ns}"
        return 0
        ;;
    esac
  done
}
