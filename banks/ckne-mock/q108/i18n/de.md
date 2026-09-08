## Question

Wie prüfen Sie, dass Ciliums WireGuard-Verschlüsselung wirklich aktiv ist und Traffic zwischen Nodes verschlüsselt?

## Options

- cilium status | grep Encryption
- kubectl get secrets
- Ping zwischen den Pods
- Die Pod-Farben im Dashboard ansehen

## Solution

**cilium status | grep Encryption** ist die richtige Antwort: Dreistufige Validierung: Der Agent meldet den Modus (WireGuard), `wg show` bestätigt Peers mit frischen Handshakes, und ein Capture auf der physischen NIC darf zwischen Pod-IPs nur verschlüsseltes UDP 51871 zeigen — keinen Klartext.
