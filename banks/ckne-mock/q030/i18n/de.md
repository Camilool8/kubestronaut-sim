## Question

Um Pod-Netze ohne NAT direkt ins physische Firmennetz zu bringen (Pod-IPs routbar) — welcher Ansatz?

## Options

- Einen NodePort pro Pod anlegen
- Die Pod-CIDRs per BGP announcen
- hostNetwork auf allen Pods aktivieren
- ndots in der resolv.conf erhöhen

## Solution

**Die Pod-CIDRs per BGP announcen** ist die richtige Antwort: BGP-fähige CNIs (Cilium BGP Control Plane, Calico BGP) bauen Sessions zu den Routern auf und announcen die podCIDRs jedes Nodes. Das externe Netz lernt die Routen und erreicht Pods direkt — ohne Kapselung/NAT.
