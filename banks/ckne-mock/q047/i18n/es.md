## Question

¿Qué herramienta del ecosistema Cilium proporciona visibilidad de flujos de red (L3–L7), incluidos los veredictos de policy (FORWARDED/DROPPED)?

## Options

- etcdctl watch /network
- CriticTool
- kubectl top pods --network
- Hubble (observe, UI, metrics)

## Solution

**Hubble (observe, UI, metrics)** es la respuesta correcta: `Hubble` lee eventos eBPF del datapath: `hubble observe --verdict DROPPED` muestra qué flujo fue bloqueado y por qué policy. También exporta métricas de flujo/DNS/HTTP a Prometheus.
