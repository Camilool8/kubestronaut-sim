## Question

Warum dürfen sich --cluster-cidr (Pods) und --service-cluster-ip-range NIEMALS überlappen?

## Options

- Weil DNS gleiche Bereiche verlangt
- Weil ClusterIPs virtuell sind
- Sie dürfen problemlos überlappen
- Aus Konfigurationsästhetik

## Solution

**Weil ClusterIPs virtuell sind** ist die richtige Antwort: Es sind getrennte Adressebenen mit verschiedenen Mechanismen (Routen/CNI vs. DNAT-Regeln). Überlappung führt dazu, dass dieselbe Adresse mal Service-Regeln matcht, mal zu einem Pod routet — falsche, intermittierende Verbindungen: der schlimmste Bug-Typ.
