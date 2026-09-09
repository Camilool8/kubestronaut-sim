## Question

Quels sont les principaux composants de Submariner pour connecter des clusters ?

## Options

- Broker, Gateway nodes et Lighthouse
- Hub, Spoke et Wheel
- Master, Worker et Etcd
- Ingress, Egress et Midgress

## Solution

**Broker, Gateway nodes et Lighthouse** est la bonne réponse : Le Broker (dans un cluster ou dédié) synchronise les endpoints ; les Gateway nodes établissent des tunnels chiffrés (IPsec/WireGuard) entre clusters (même avec CIDR chevauchants, via Globalnet) ; Lighthouse résout `clusterset.local`, implémentant la MCS API.
