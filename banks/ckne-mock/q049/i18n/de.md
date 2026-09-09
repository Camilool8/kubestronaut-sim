## Question

Warum ist die p99-Latenz aus einem Histogramm meist aufschlussreicher als der Durchschnitt bei Netzwerkproblemen?

## Options

- p99 braucht weniger Speicher
- Der Durchschnitt ist in Prometheus nicht berechenbar
- Kein praktischer Unterschied
- Der Durchschnitt versteckt den Tail: p99 zeigt das schlechteste 1 % der Requests

## Solution

**Der Durchschnitt versteckt den Tail: p99 zeigt das schlechteste 1 % der Requests** ist die richtige Antwort: Netzwerkprobleme leben im Tail (Retransmissions, Queues, Conntrack). Mit `histogram_quantile(0.99, rate(..._bucket[5m]))` sieht man das schlechteste 1 % — das, was Nutzer wirklich spüren.
