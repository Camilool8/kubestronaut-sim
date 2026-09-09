## Question

Ein Pod ist Running, bekommt aber keinen Traffic vom Service. `kubectl get endpointslices` zeigt den Endpoint mit ready: false. Wahrscheinlichste Ursache?

## Options

- CoreDNS crasht ständig
- kube-proxy funktioniert nur mit ready: true im Manifest
- Die readinessProbe des Pods schlägt fehl und nimmt ihn aus dem Balancing
- Der ClusterIP ist abgelaufen

## Solution

**Die readinessProbe des Pods schlägt fehl und nimmt ihn aus dem Balancing** ist die richtige Antwort: Die `readinessProbe` steuert die Endpoint-Verfügbarkeit: Solange sie fehlschlägt, bleibt der Pod not-ready im EndpointSlice und erhält keinen Traffic. Das ist der Kern der "Pod Endpoint Availability". Events mit `kubectl describe pod` prüfen.
