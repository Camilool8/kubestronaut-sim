## Question

Warum ist simples Round-Robin-Balancing für LLM-Traffic schlecht und erfordert spezielle Strategien?

## Options

- Requests haben extrem variable Kosten
- GPUs können nur eine TCP-Verbindung halten
- LLMs nutzen kein HTTP
- kube-proxy blockiert KI-Traffic

## Solution

**Requests haben extrem variable Kosten** ist die richtige Antwort: Ein Request erzeugt 10 Tokens, ein anderer 4.000; Antworten sind Streaming (SSE) und langlebig, mit KV-Cache-Zustand. Inference-aware Balancer nutzen Queue-/KV-Cache-Druck pro Replika und Prefix-Affinität, plus angepasste Timeouts.
