## Question

Welche Ressource hat das Endpoints-Objekt als skalierbaren Hauptmechanismus zum Tracken der Service-Backends abgelöst?

## Options

- EndpointSlice
- PodDisruptionBudget
- BackendConfig
- ServiceEntry

## Solution

**EndpointSlice** ist die richtige Antwort: `EndpointSlice` partitioniert Endpoints in Slices (standardmäßig bis 100 pro Slice), senkt die Update-Kosten großer Services und ergänzt Topologie (Zone, Node). Das alte Endpoints-Objekt bleibt aus Kompatibilität erhalten.
