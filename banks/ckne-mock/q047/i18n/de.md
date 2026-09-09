## Question

Welches Tool im Cilium-Ökosystem liefert Sichtbarkeit auf Netzwerk-Flows (L3–L7), inklusive Policy-Verdicts (FORWARDED/DROPPED)?

## Options

- etcdctl watch /network
- CriticTool
- kubectl top pods --network
- Hubble (observe, UI, metrics)

## Solution

**Hubble (observe, UI, metrics)** ist die richtige Antwort: `Hubble` liest eBPF-Datapath-Events: `hubble observe --verdict DROPPED` zeigt, welcher Flow von welcher Policy blockiert wurde. Es exportiert außerdem Flow-/DNS-/HTTP-Metriken nach Prometheus.
