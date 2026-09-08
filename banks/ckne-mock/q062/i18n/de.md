## Question

Bei VXLAN mit Node-Interfaces auf MTU 1500 — welche Einstellung vermeidet Fragmentierung/Verlust großer Pakete?

## Options

- Die CNI-MTU abzüglich des Tunnel-Overheads (z. B. 1450)
- Die Replikazahl reduzieren
- Die Pod-MTU auf 9000 heben
- TCP deaktivieren und in den Pods nur UDP verwenden

## Solution

**Die CNI-MTU abzüglich des Tunnel-Overheads (z. B. 1450)** ist die richtige Antwort: Der VXLAN-Header kostet ~50 Bytes; sendet der Pod 1500-Byte-Frames, überschreitet das gekapselte Paket die physische MTU und wird verworfen. CNI-MTU auf 1450 setzen (Feld `mtu`/Auto-Detection) oder Jumbo Frames (9000) im physischen Netz aktivieren.
