## Question

Le CNI utilise MTU 1450 sur les interfaces de pods, et le réseau physique supporte les jumbo frames (9000). Quel réglage tire la performance maximale avec VXLAN ?

## Options

- Désactiver le VXLAN
- MTU 65535 sur les pods
- Monter la MTU physique à 9000 et régler les pods à 8950
- Garder 1450 — obligatoire avec tout VXLAN

## Solution

**Monter la MTU physique à 9000 et régler les pods à 8950** est la bonne réponse : La limite du pod est toujours MTU physique − overhead (~50 pour VXLAN). Avec des jumbo frames de bout en bout, 8950 sur les pods multiplie le débit des workloads data. L'erreur commune : n'augmenter qu'un côté.
