#!/usr/bin/env bash
# points: 4
# desc: Gateway lacerta-gateway is on class sim with one HTTPS:443 listener for the host, terminating TLS with lacerta-tls, and the controller programmed it
set -uo pipefail
. /banks/_lib/checks.sh

host=q15-lacerta.sim.local

kubectl -n lacerta get secret lacerta-tls >/dev/null 2>&1 || {
  echo "Secret lacerta-tls is gone from Namespace lacerta"
  show_actual text "$(kubectl -n lacerta get secret 2>/dev/null)"
  show_why "The certificate was seeded with the Namespace and was not yours to replace: the listener this question asks for references it by name, and the Ingress being retired served it too. Without it there is nothing for a listener to terminate TLS with, and no way to tell an answer that referenced the right Secret from one that referenced a Secret that never existed."
  exit 1
}

gw=$(kubectl -n lacerta get gateway lacerta-gateway -o json 2>/dev/null)
[ -n "$gw" ] || {
  echo "no Gateway named lacerta-gateway in Namespace lacerta"
  show_actual text "$(kubectl -n lacerta get gateway 2>/dev/null; kubectl get gatewayclass 2>/dev/null)"
  show_why "Nothing terminates TLS for this Namespace on the Gateway API yet. An Ingress is one object holding both halves of the job; the Gateway API splits them, and the half that owns the address, the port and the certificate is the Gateway. It is the object a controller acts on: until one exists, an HTTPRoute has no parent to attach to and no proxy is configured for this Namespace at all."
  exit 1
}

evidence() {
  show_actual yaml "$(kubectl -n lacerta get gateway lacerta-gateway -o yaml 2>/dev/null | k8s_clean)"
  # TODO(lead): generate expected/gateway.yaml per docs/bank-spec.md:588-622
  show_expected yaml "/banks/${BANK:-cka-mock-01}/q15/expected/gateway.yaml"
  show_why "$1"
}

class=$(printf '%s' "$gw" | jq -r '.spec.gatewayClassName // ""')

# Every listener as protocol/port/hostname, so one string says both what is
# there and what is missing. Compared against the single listener the question
# asks for, which is also what makes a stray extra listener visible.
listeners=$(printf '%s' "$gw" | jq -r '[.spec.listeners[]?
  | "\(.protocol)/\(.port)/\(.hostname // "(any host)")"] | join(" ")')

https=$(printf '%s' "$gw" | jq -c 'first(.spec.listeners[]? | select(.protocol == "HTTPS")) // {}')
mode=$(printf '%s' "$https" | jq -r '.tls.mode // "(unset)"')
refs=$(printf '%s' "$https" | jq -r '[.tls.certificateRefs[]?
  | "\(.kind // "Secret")/\(.name)"] | join(" ")')

programmed=$(printf '%s' "$gw" | jq -r 'first(.status.conditions[]?
  | select(.type == "Programmed") | .status) // "(no status yet)"')
resolved=$(printf '%s' "$gw" | jq -r '[.status.listeners[]?.conditions[]?
  | select(.type == "ResolvedRefs") | .status] | join(" ")')
complaints=$(printf '%s' "$gw" | jq -r '[(.status.conditions[]?, .status.listeners[]?.conditions[]?)
  | select(.status != "True") | "\(.type)=\(.status): \(.message)"] | join("; ")' | head -c 300)

terminates_with_the_seeded_secret() {
  [ "$mode" = "Terminate" ] && [ "$refs" = "Secret/lacerta-tls" ]
}

accepted_by_controller() {
  [ "$programmed" = "True" ] || return 1
  [ -n "$resolved" ] || return 1
  case " $resolved " in
    *" False "*|*" Unknown "*) return 1 ;;
  esac
  return 0
}

crit 1 "handed to GatewayClass sim" \
  "gatewayClassName is '$class', want sim" \
  "gatewayClassName is what hands a Gateway to a controller, and it is not optional or defaulted: a name matching no GatewayClass leaves an object the API stores quite happily and nothing ever acts on. This cluster registers one class — k get gatewayclass prints it, along with the controller that claims it — and it is not named after the product that implements it." \
  -- [ "$class" = "sim" ]

crit 1 "one HTTPS listener on 443 for the host" \
  "listeners are '$listeners', want HTTPS/443/${host} alone" \
  "A listener is a port, a protocol and optionally a host name, and all three are graded here because all three matter. HTTPS rather than HTTP is what makes the listener terminate TLS at all; 443 is the port the proxy will bind. The hostname is the SNI this listener answers to — leave it out and the listener answers for every name, which is a wider Gateway than the Ingress it replaces, and the routing this question describes is for one host." \
  -- [ "$listeners" = "HTTPS/443/${host}" ]

crit 1 "terminates TLS with Secret lacerta-tls" \
  "the HTTPS listener has mode '$mode' and certificateRefs '$refs', want Terminate with Secret/lacerta-tls" \
  "The certificate moves from the Ingress's spec.tls list onto the listener, as spec.listeners[].tls.certificateRefs — a list of object references rather than a bare secretName, which is what lets a listener reference a certificate that is not a core Secret at all. mode Terminate means the proxy holds the certificate and decrypts here; Passthrough would hand the TLS session on to the backend untouched, and then no HTTPRoute could read a path out of it. A reference with no namespace means this Namespace, which is where the seeded Secret already is." \
  -- terminates_with_the_seeded_secret

crit 1 "the controller programmed it" \
  "Programmed=${programmed}, listener ResolvedRefs='${resolved:-(none reported)}'${complaints:+ — $complaints}" \
  "The controller writes back what it made of the object, and this is where a Gateway that reads correctly and serves nothing says so. Programmed means the data plane for this Gateway exists and is configured; ResolvedRefs on the listener means the certificate reference actually resolved to a Secret it could read. A missing Secret, a Secret of the wrong type, or a class no controller claims all leave the spec looking exactly as intended, and only the status naming it." \
  -- accepted_by_controller

crit_all_passed || evidence "$(crit_why)"
report "gateway ok"
