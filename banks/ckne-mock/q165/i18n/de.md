## Question

Welcher Befehl validiert auf einmal Pod-zu-Pod, Pod-zu-Service, DNS, Policies und (falls aktiv) Verschlüsselung in einem Cilium-Cluster?

## Options

- ping -c 1 8.8.8.8
- kubectl get all
- cilium delete --all
- cilium connectivity test

## Solution

**cilium connectivity test** ist die richtige Antwort: `cilium connectivity test` ist der kanonische Smoke-Test nach Installation/Upgrade: Er deployt Test-Workloads und fährt Dutzende Szenarien (Hairpin, NodePort lokal/remote, L3–L7-Policies, DNS) mit Fehlerbericht — und benennt das exakt scheiternde Szenario.
