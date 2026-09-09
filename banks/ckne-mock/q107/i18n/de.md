## Question

Was ergänzt AdminNetworkPolicy (ANP) gegenüber der traditionellen NetworkPolicy?

## Options

- Nur eine Firewall fürs Internet
- Ersetzt RBAC für Netzwerk-Traffic
- Cluster-Scope, Priorität und Allow/Deny/Pass-Aktionen
- Nichts, nur eine Umbenennung der NetworkPolicy

## Solution

**Cluster-Scope, Priorität und Allow/Deny/Pass-Aktionen** ist die richtige Antwort: ANP gibt Admins nicht überschreibbare Leitplanken (z. B. "nie Egress zu Cloud-Metadata erlauben"), ausgewertet VOR den User-NetworkPolicies; BaselineAdminNetworkPolicy definiert den Cluster-Default DANACH. Reihenfolge: ANP → NetworkPolicy → BANP.
