## Question

Nach einem Pod-Neustart bleibt der Graph von rate(container_network_transmit_bytes_total[5m]) korrekt, obwohl der Counter auf null zurückfiel. Warum?

## Options

- rate() erkennt Counter-Resets und kompensiert sie
- Prometheus verbietet Neustarts
- Counter resetten nie
- Das Kubelet sendet die alten Daten erneut

## Solution

**rate() erkennt Counter-Resets und kompensiert sie** ist die richtige Antwort: Essenzielle PromQL-Semantik: `rate()`/`increase()` behandeln Resets (Wert kleiner als zuvor) unter Kontinuitätsannahme. Manuelle Arithmetik mit Roh-Countern bricht bei jedem Neustart — häufiger Fehler in handgebauten Queries.
