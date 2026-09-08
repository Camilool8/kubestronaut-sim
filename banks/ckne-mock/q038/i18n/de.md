## Question

Um allen Pod-zu-Pod-Traffic zwischen Nodes transparent zu verschlüsseln, ohne Anwendungen zu ändern — welches CNI-Feature?

## Options

- kube-proxy im IPVS-Modus
- NetworkPolicy mit einem Feld encrypt: true
- WireGuard- oder IPsec-Verschlüsselung im CNI
- TLS in CoreDNS

## Solution

**WireGuard- oder IPsec-Verschlüsselung im CNI** ist die richtige Antwort: Cilium und Calico bieten transparente Node-zu-Node-Verschlüsselung: WireGuard (automatische Schlüssel pro Node) oder IPsec (Rotation via Secret). Sie deckt den Draht zwischen Nodes ab — komplementär zu Anwendungs-mTLS.
