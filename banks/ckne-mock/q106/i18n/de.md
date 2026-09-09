## Question

Wie erzeugt man in Calico ein explizites Deny mit Vorrang vor Allow-Regeln?

## Options

- Explizites Deny ist in keinem CNI möglich
- Calico-Policies mit action: Deny und dem order-Feld
- Mit einer Annotation deny=true an der nativen Policy
- Das CNI löschen

## Solution

**Calico-Policies mit action: Deny und dem order-Feld** ist die richtige Antwort: Calico-Policies (GlobalNetworkPolicy/NetworkPolicy) haben `order` und Allow/Deny/Log/Pass — klassisches Firewall-Modell. Ein Deny mit niedriger Order schlägt spätere Allows. Die native API kann das nicht; daher nutzen regulierte Umgebungen CNI-CRDs oder AdminNetworkPolicy.
