#!/usr/bin/env bash
# points: 2
# desc: Secret portal-tls is a kubernetes.io/tls Secret built from the generated key pair
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n sculptor get secret 2>/dev/null)"
  show_why "$1"
}

kubectl -n sculptor get secret portal-tls >/dev/null 2>&1 || {
  echo "no Secret named portal-tls in Namespace sculptor"
  show_actual text "$(kubectl -n sculptor get secret 2>/dev/null)"
  show_why "The Ingress can only end TLS with a Secret that exists in its own Namespace, and this one is not there. A Secret in another Namespace is not visible to it: ingress-nginx looks the name up in the Ingress's Namespace and falls back to its own placeholder certificate when it finds nothing."
  exit 1
}

type=$(kubectl -n sculptor get secret portal-tls -o jsonpath='{.type}' 2>/dev/null)
cert=$(kubectl -n sculptor get secret portal-tls -o jsonpath='{.data.tls\.crt}' 2>/dev/null | base64 -d 2>/dev/null)

on_disk() { [ -s /opt/course/37/tls.crt ] && [ -s /opt/course/37/tls.key ]; }
is_cert() { printf '%s' "$cert" | grep -q 'BEGIN CERTIFICATE'; }

crit 1 "the key pair was written to /opt/course/37" \
  "/opt/course/37/tls.crt and /opt/course/37/tls.key are not both present and non-empty" \
  "The question asks for the certificate and the key at those two paths. openssl req writes both in one go when it is asked for a self-signed certificate — -x509 because there is no authority here to send a signing request to, and -nodes because a passphrase-protected key is one nginx can never load unattended." \
  -- on_disk

crit 2 "the Secret is of type kubernetes.io/tls" \
  "type is '$type', want kubernetes.io/tls" \
  "kubectl create secret tls is the only thing that produces this type, and the type is not decoration: it is what fixes the two data keys at tls.crt and tls.key, which is where ingress-nginx looks. Built with create secret generic the same two files land in an Opaque Secret, the API accepts it, the Ingress references it happily, and the controller serves its own placeholder certificate instead." \
  -- [ "$type" = "kubernetes.io/tls" ]

crit 1 "tls.crt holds the certificate" \
  "tls.crt does not decode to a PEM certificate" \
  "The data under tls.crt should be the PEM certificate itself, base64-encoded once by the API. Passing the private key to --cert, or a signing request instead of a certificate, produces a Secret of the right type that no controller can serve." \
  -- is_cert

crit_all_passed || evidence "$(crit_why)"
report "tls secret ok"
