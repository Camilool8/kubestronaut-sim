## Question

Bei Multus mit Sekundärnetzen auf mehreren Nodes: Warum ist das whereabouts-IPAM dem host-local vorzuziehen?

## Options

- Weil host-local externes DHCP verlangt
- host-local vergibt pro Node ohne Koordination und kann IPs doppelt vergeben
- Weil es bei jeder CNI-ADD- und -DEL-Operation schneller ist
- Weil whereabouts nur IPv6 unterstützt

## Solution

**host-local vergibt pro Node ohne Koordination und kann IPs doppelt vergeben** ist die richtige Antwort: `host-local` hält den Zustand nur auf der Node-Platte — zwei Nodes können im Sekundärnetz dieselbe IP vergeben. `whereabouts` verzeichnet Zuteilungen in Cluster-CRDs und garantiert Eindeutigkeit über alle Nodes.
