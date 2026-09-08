## Question

Quel outil de l'écosystème Cilium donne la visibilité sur les flux réseau (L3–L7), y compris les verdicts de policy (FORWARDED/DROPPED) ?

## Options

- etcdctl watch /network
- CriticTool
- kubectl top pods --network
- Hubble (observe, UI, metrics)

## Solution

**Hubble (observe, UI, metrics)** est la bonne réponse : `Hubble` lit les événements du datapath eBPF : `hubble observe --verdict DROPPED` montre quel flux a été bloqué et par quelle policy. Il exporte aussi des métriques flow/DNS/HTTP vers Prometheus.
