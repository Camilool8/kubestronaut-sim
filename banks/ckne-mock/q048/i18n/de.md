## Question

Um einen Request Ende-zu-Ende durch Gateway → Service A → Service B zu verfolgen — welches Muster/welche Technologie, und was muss propagiert werden?

## Options

- Ping mit NTP-synchronisierten Timestamps
- SNMP-Polling auf den Switches
- kubectl logs -f auf allen Pods
- Verteiltes Tracing mit Propagation des traceparent-Headers

## Solution

**Verteiltes Tracing mit Propagation des traceparent-Headers** ist die richtige Antwort: Distributed Tracing (OpenTelemetry/Jaeger) korreliert Spans jedes Hops; ohne Propagation des `traceparent`-Headers (W3C Trace Context) werden Spans zu Waisen. Das richtige Werkzeug, um zu finden, wo Latenz entsteht.
