## Question

Um Traffic vom Frontend-Pod (10.244.3.7) zu erlauben, erstellten Sie eine ipBlock-Regel mit 10.244.3.7/32. Heute lief es, morgen brach es. Warum?

## Options

- ipBlock läuft nach 24 h ab und muss erneuert werden
- Ein /32-CIDR ist in NetworkPolicy-Regeln ungültig
- Das Frontend braucht hostNetwork, um selektierbar zu sein
- Pod-IPs sind flüchtig und können SNAT-et ankommen; nutze Selectors

## Solution

**Pod-IPs sind flüchtig und können SNAT-et ankommen; nutze Selectors** ist die richtige Antwort: Policies zwischen Workloads sollten Identität (Labels) statt Adressen nutzen. Die Doku beschränkt ipBlock auf cluster-externe IPs — doppeltes Risiko: rotierende IPs und NAT auf dem Pfad. Zwischen Pods: podSelector/namespaceSelector.
