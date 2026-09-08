## Question

Ein Client mit hohem Durchsatz zum selben Ziel scheitert mit "cannot assign requested address"; `ss -s` im Pod zeigt Zehntausende TIME_WAIT-Verbindungen. Problem?

## Options

- Der Kernel des Nodes ist korrupt
- Die MTU ist auf dem Pfad zu niedrig
- DNS fehlt im Namespace des Pods
- Erschöpfung der ephemeren Ports durch TIME_WAIT-Stau

## Solution

**Erschöpfung der ephemeren Ports durch TIME_WAIT-Stau** ist die richtige Antwort: Das Muster "öffnen-schließen pro Request" tötet den Client vor dem Server: ~28k ephemere Ports ÷ 60 s TIME_WAIT ≈ Deckel von ~470 neuen Verbindungen/s pro Ziel. Connection-Pooling/Keep-Alive löst es in der Architektur, nicht im sysctl (tcp_tw_reuse nur wo anwendbar).
