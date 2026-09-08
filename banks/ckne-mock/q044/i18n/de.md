## Question

Was sind zwei reale Einschränkungen nativer Kubernetes-NetworkPolicies?

## Options

- Kein Filtern nach Hostname/L7
- Sie gelten nur für den Namespace kube-system
- Sie erfordern Pod-Neustarts bei jeder Änderung
- Sie funktionieren nicht mit TCP

## Solution

**Kein Filtern nach Hostname/L7** ist die richtige Antwort: Die native API ist L3/L4: keine FQDN-Regeln, HTTP-Methoden, kein explizites Deny, keine Priorität, kein Logging. CNIs erweitern das — `toFQDNs` und HTTP-Regeln in Cilium, `action: Deny/Log` in Calico. Policies greifen ohne Pod-Neustart.
