## Question

Was passiert mit neuen Verbindungen zu einem ClusterIP, dessen Service KEINE ready Endpoints hat?

## Options

- Sie werden zum Apiserver umgeleitet
- Sofort abgelehnt (REJECT → "connection refused")
- Sie warten im Kernel-Queue, bis ein Pod hochkommt
- Sie bekommen ein vom kube-proxy generiertes HTTP 404

## Solution

**Sofort abgelehnt (REJECT → "connection refused")** ist die richtige Antwort: kube-proxy installiert eine Reject-Regel für Services ohne Endpoints — der Client bekommt sofort "connection refused". Refused (keine Endpoints/falscher Port) von Timeout (Policy/Route/Firewall) zu unterscheiden beschleunigt das Troubleshooting enorm.
