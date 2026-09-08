## Question

Quels groupes de métriques Hubble peut-il exporter vers Prometheus (hubble.metrics) ?

## Options

- Seulement l'usage CPU
- dns, drop, tcp, flow, icmp, http
- Des métriques de facturation cloud
- Seulement des logs texte

## Solution

**dns, drop, tcp, flow, icmp, http** est la bonne réponse : En activant `hubble.metrics.enabled={dns,drop,tcp,flow,icmp,http}`, Hubble expose des séries par namespace/workload : requêtes et erreurs DNS, raisons de drop (policy, CT), flags TCP et codes/latences HTTP — la base des dashboards réseau Grafana/Cilium.
