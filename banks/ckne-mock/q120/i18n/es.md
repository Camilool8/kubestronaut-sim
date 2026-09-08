## Question

Al aplicar las "golden signals" a la red del cluster, ¿qué conjunto de métricas corresponde a latencia, tráfico, errores y saturación?

## Options

- Réplicas, nodos, namespaces y CRD instalados en el cluster
- Latencia, bytes/s, errores 5xx/retrans y saturación de conntrack
- Commits, builds, deploys y rollbacks por día
- CPU, memoria, disco y uptime de los worker nodes

## Solution

**Latencia, bytes/s, errores 5xx/retrans y saturación de conntrack** es la respuesta correcta: Las cuatro señales se traducen directamente en latencia p99, throughput (bytes/pps), tasa de errores (retrans/resets/drops/5xx) y saturación (conntrack entries/limit, qdisc drops, utilización del ancho de banda). Alertar sobre ellas cubre la mayoría de las degradaciones de red.
