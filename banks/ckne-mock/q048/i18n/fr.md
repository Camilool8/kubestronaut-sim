## Question

Pour tracer une requête de bout en bout à travers gateway → service A → service B, quel patron/technologie, et que faut-il propager ?

## Options

- Ping avec timestamps synchronisés par NTP
- Polling SNMP sur les switches
- kubectl logs -f sur tous les pods
- Tracing distribué en propageant le header traceparent

## Solution

**Tracing distribué en propageant le header traceparent** est la bonne réponse : Le tracing distribué (OpenTelemetry/Jaeger) corrèle les spans de chaque saut ; sans propager le header `traceparent` (W3C Trace Context), les spans deviennent orphelins. C'est l'outil pour trouver où naît la latence.
