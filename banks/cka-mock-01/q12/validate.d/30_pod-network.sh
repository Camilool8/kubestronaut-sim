#!/usr/bin/env bash
# points: 3
# desc: the pod network really carries traffic — client reaches web by address and by Service name, and the seeded NetworkPolicy is enforced against outsider
# expected: none — this sends real traffic over exec (Pod-to-Pod, the
#           Service's cluster DNS name, and a NetworkPolicy's enforcement
#           against a third Pod) and grades what the dataplane does with each
#           request at the moment it is sent, an event rather than a
#           document; the policy this exercises is seeded, not authored here.
set -uo pipefail
. /banks/_lib/checks.sh

AUX=/home/candidate/.kube/aux-cni
NS=q12-probe

probe_client=''
probe_outsider=''

pods=$(kubectl --kubeconfig "$AUX" --request-timeout=5s -n "$NS" get pod -o json 2>/dev/null)

listing=$(printf '%s' "${pods:-null}" \
  | jq '[ .items[]?
          | {app: (.metadata.labels.app // ""),
             phase: (.status.phase // ""),
             address: ((.status.podIP // "") | if . == "" then "none" else "assigned" end)} ]' 2>/dev/null)

evidence() {
  show_actual text "$(printf 'from the client Pod:\n%s\n\nfrom the outsider Pod:\n%s\n\nPods in %s:\n%s\n\npolicies in %s:\n%s\n' \
    "${probe_client:-(not asked)}" "${probe_outsider:-(not asked)}" \
    "$NS" "${listing:-none}" \
    "$NS" "$(kubectl --kubeconfig "$AUX" --request-timeout=5s -n "$NS" get networkpolicy 2>/dev/null)")"
  show_why "$1"
}

# One Running Pod per role, with the address to send to. Names and addresses are
# read here and never graded: both change under every rollout and every restart
# of this environment.
pick() {
  printf '%s' "${pods:-null}" | jq -r --arg a "$1" '
    first(.items[]?
      | select((.metadata.labels.app // "") == $a
               and .status.phase == "Running"
               and ((.status.podIP // "") != "")
               and (.metadata.deletionTimestamp == null))
      | "\(.metadata.name) \(.status.podIP)")' 2>/dev/null
}

web=$(pick web);           web_ip=${web##* }
client=$(pick client);     client_pod=${client%% *}
outsider=$(pick outsider); outsider_pod=${outsider%% *}

missing=''
[ -n "$web" ] || missing="web"
[ -n "$client" ] || missing="${missing:+$missing, }client"
[ -n "$outsider" ] || missing="${missing:+$missing, }outsider"

# The not-done gate. This check is decided by traffic, and there is no traffic to
# send while the Pods are Pending — which is exactly how the cluster was handed
# over. Nothing partial is owed for a network that was never installed, so this
# scores zero rather than crediting the two criteria that are about traffic NOT
# arriving.
[ -z "$missing" ] || {
  echo "no Running Pod with an address for: $missing"
  evidence "This check sends real traffic, so it needs all three seeded Pods running to send it: the client Pod opens the connections, the web Pod is what must answer on 8080, and the outsider Pod is the one the Namespace's NetworkPolicy must refuse. Listed as Pending, they are the untouched state of the task rather than anything you broke — with no pod network the node is NotReady and nothing is scheduled — and they are not yours to create, edit or restart: they start by themselves within seconds of the node going Ready. An empty listing means something else: either the Namespace is gone, or the aux-cni cluster could not be read from this instance at all. Either way a policy cannot be shown to deny anything from a Pod that does not exist."
  exit 1
}

# Every probe is bounded twice over. A packet dropped by policy is not refused,
# so an unbounded client waits for a handshake that never comes; busybox's own
# timeout caps each request inside the Pod, and the outer one caps the exec
# itself in case the aux API stops answering mid-stream. Worst case here is 10 s
# in the client and 5 s in the outsider, well inside the check's 30 s.
probe_client=$(timeout 14 kubectl --kubeconfig "$AUX" --request-timeout=10s -n "$NS" exec "$client_pod" -- sh -c "
  timeout 5 wget -q -T 3 -O /dev/null http://${web_ip}:8080/ 2>/dev/null && echo 'address ok' || echo 'address blocked'
  timeout 5 wget -q -T 3 -O /dev/null http://web.${NS}.svc.cluster.local:8080/ 2>/dev/null && echo 'service ok' || echo 'service blocked'
" 2>&1)

probe_outsider=$(timeout 9 kubectl --kubeconfig "$AUX" --request-timeout=10s -n "$NS" exec "$outsider_pod" -- sh -c "
  timeout 5 wget -q -T 3 -O /dev/null http://${web_ip}:8080/ 2>/dev/null && echo 'address ok' || echo 'address blocked'
" 2>&1)

res() { printf '%s\n' "$2" | awk -v k="$1" '$1 == k {print $2}'; }

pod_to_pod_works() { [ "$(res address "$probe_client")" = "ok" ]; }
service_name_works() { [ "$(res service "$probe_client")" = "ok" ]; }

# Conditioned on the allowed path working, and that is the whole point: on a
# cluster where nothing reaches anything, the outsider being refused is not
# evidence of a policy — it is evidence of no network. Only once the same
# request succeeds from the client does the refusal mean the plugin is
# enforcing the rule rather than storing it.
policy_enforced() {
  pod_to_pod_works && [ "$(res address "$probe_outsider")" = "blocked" ]
}

if pod_to_pod_works; then
  policy_msg="the outsider Pod reached web on 8080, which the seeded policy does not allow"
else
  policy_msg="nothing reaches web at all yet, so the outsider being refused says nothing about the policy"
fi

crit 1 "a client Pod reaches the web Pod at its address" \
  "the client Pod could not reach web on 8080 at its Pod address" \
  "This is the plainest thing a pod network does: two Pods on the same cluster, addressed directly, with no Service and no DNS in the way. If the Pods are Running but this fails, the plugin's Pod came up without finishing its job — the usual causes are a dataplane that never programmed the node and a pod CIDR that disagrees with the one the cluster was built with, since an address handed out from a range nothing routes is indistinguishable from no address at all. The manifest staged for you is already patched to this cluster's pod CIDR, so applying it unedited is the supported path. Note also that the Namespace's NetworkPolicy allows exactly this: TCP 8080 to the app=web Pods from the app=client Pods." \
  -- pod_to_pod_works

crit 1 "the web Service answers on its cluster DNS name" \
  "the client Pod could not reach http://web.${NS}.svc.cluster.local:8080/" \
  "A Service name is three things working at once, and all three were down while the node was: CoreDNS itself had been Pending since the cluster was built, so there was nothing to answer the lookup; kube-proxy's rule has to reach a real endpoint address; and the packet still has to cross the pod network to get there. That makes this the end-to-end check on the install rather than a second opinion on the previous one — a cluster whose Pods can reach each other by address but cannot resolve a Service name usually has its DNS Pods still waiting, which is worth looking at before anything else." \
  -- service_name_works

crit 1 "the seeded NetworkPolicy is enforced against outsider" \
  "$policy_msg" \
  "A NetworkPolicy is an object the API server stores whatever the cluster's plugin can do with it: on a cluster whose network plugin does not implement the API, this policy is accepted, listed by 'kubectl get netpol' and enforced by nobody, and the outsider Pod walks straight in. That is why the plugin staged here is one that enforces policy, and why this criterion exists at all — 'the Pods can talk' is a lower bar than 'the cluster does what its policies say'. If the allowed path works and this one does too, the install is genuinely complete. If this fails while the client's own request succeeds, check that the seeded policy is still in the Namespace: it is the instrument this is measured with and it was not yours to remove." \
  -- policy_enforced

crit_all_passed || evidence "$(crit_why)"
report "the pod network carries traffic and the policy is enforced"
