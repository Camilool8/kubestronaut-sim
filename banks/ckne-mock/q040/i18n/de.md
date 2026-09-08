## Question

Wie konfigurieren Sie in der Gateway API TLS-Terminierung an einem HTTPS-Listener?

## Options

- Das Zertifikat als hostPath in jedem kube-proxy mounten
- Per Annotation tls=true am Service
- Am Gateway-Listener, mit tls.mode: Terminate und certificateRefs
- An der HTTPRoute, Feld spec.tls.cert

## Solution

**Am Gateway-Listener, mit tls.mode: Terminate und certificateRefs** ist die richtige Antwort: Der Listener deklariert `protocol: HTTPS`, `tls.mode: Terminate` und `certificateRefs` auf `kubernetes.io/tls`-Secrets. Ein Secret in fremdem Namespace verlangt einen `ReferenceGrant`.
