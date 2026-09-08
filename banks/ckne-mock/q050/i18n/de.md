## Question

Um zu auditieren, WELCHER Netzwerk-Traffic zwischen Workloads tatsächlich floss (oder blockiert wurde) — welche Datenquelle ist korrekt?

## Options

- Logs des kube-schedulers
- Datapath-Flow-Logs (Hubble, Calico, VPC Flow Logs)
- kubectl get events
- Audit-Log des kube-apiservers auf RequestResponse-Level

## Solution

**Datapath-Flow-Logs (Hubble, Calico, VPC Flow Logs)** ist die richtige Antwort: Häufige Verwechslung: Apiserver-Audit-Logs protokollieren API-Operationen. Für Netzwerk-Traffic braucht es CNI-/Datapath-Flow-Logs — Quelle, Ziel, Port, Verdict, Policy — exportierbar in ein SIEM.
