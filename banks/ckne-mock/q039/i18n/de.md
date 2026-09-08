## Question

Welcher Mechanismus liefert gegenseitige Authentifizierung pro Workload (kryptografische Identität pro Pod) mit automatischem mTLS, typischerweise via Service Mesh?

## Options

- Basic Auth am Kubelet
- Ein geteiltes Passwort, verteilt über eine ConfigMap
- Das NodeRestriction-Admission-Plugin des Apiservers
- mTLS mit automatisch ausgestellten SPIFFE/SVID-Identitäten

## Solution

**mTLS mit automatisch ausgestellten SPIFFE/SVID-Identitäten** ist die richtige Antwort: Meshes geben jedem Workload eine SPIFFE-Identität (z. B. `spiffe://cluster/ns/sa/…`) in kurzlebigen X.509-Zertifikaten (SVIDs) und etablieren automatisches mTLS auf Basis des ServiceAccounts, nicht der IP.
