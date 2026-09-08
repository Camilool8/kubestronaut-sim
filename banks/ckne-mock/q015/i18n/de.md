## Question

Was liefert DNS bei einer Query auf einen headless Service (clusterIP: None) mit Selector?

## Options

- Einen CNAME auf den kube-apiserver
- Den ClusterIP des Service
- Immer NXDOMAIN
- A/AAAA-Records mit den IPs jedes bereiten Pods

## Solution

**A/AAAA-Records mit den IPs jedes bereiten Pods** ist die richtige Antwort: Headless Services haben keinen VIP: CoreDNS antwortet mit den Pod-IPs. Bei StatefulSets bekommt jeder Pod zusätzlich einen stabilen Record `pod.service.ns.svc.cluster.local` — essenziell für Datenbanken und identitätsbasierte Discovery.
