## Question

Wo liegt bei IPsec in Cilium der Schlüssel, und welche operative Praxis ist erforderlich?

## Options

- Hardcodiert im Agent-Image
- In einer Datei auf dem Admin-Laptop
- Im Secret cilium-ipsec-keys
- IPsec braucht keinen Schlüssel

## Solution

**Im Secret cilium-ipsec-keys** ist die richtige Antwort: Cilium liest Schlüssel/Algorithmus aus dem Secret `cilium-ipsec-keys` (kube-system). Die Rotation ist operativ: neuen Schlüssel mit inkrementierter Key-ID erzeugen; die Agents wechseln ohne Downtime. WireGuard verwaltet Node-Schlüssel dagegen automatisch.
