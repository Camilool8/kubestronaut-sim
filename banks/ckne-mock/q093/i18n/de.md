## Question

Was unterscheidet in der MCS API einen ServiceImport vom Typ ClusterSetIP von einem vom Typ Headless?

## Options

- ClusterSetIP liefert einen einzigen VIP mit Cluster-übergreifendem Balancing
- Es gibt keinen Unterschied
- ClusterSetIP ist nur IPv4, Headless nur IPv6
- Headless ist immer schneller als ClusterSetIP

## Solution

**ClusterSetIP liefert einen einzigen VIP mit Cluster-übergreifendem Balancing** ist die richtige Antwort: Es spiegelt das Single-Cluster-Verhalten: `ClusterSetIP` gibt einen VIP für balancierten Konsum; `Headless` exponiert jedes Backend mit eigenen Records — nötig, wenn der Client mit bestimmten Instanzen über Cluster hinweg sprechen muss (Multi-Cluster-StatefulSets).
