## Question

Qual ferramenta do ecossistema Cilium fornece visibilidade de fluxos de rede (L3–L7), incluindo vereditos de policy (FORWARDED/DROPPED)?

## Options

- etcdctl watch /network
- CriticTool
- kubectl top pods --network
- Hubble (observe, UI, metrics)

## Solution

**Hubble (observe, UI, metrics)** é a resposta correta: O `Hubble` lê eventos eBPF do datapath: `hubble observe --verdict DROPPED` mostra qual fluxo foi bloqueado e por qual policy. Também exporta métricas de fluxo/DNS/HTTP para Prometheus.
