## Question

Su Grafana de red por pod tiene millones de series y Prometheus consume decenas de GB. La mayor fuente del problema suele ser:

## Options

- El tema oscuro de Grafana
- Gráficos con demasiados colores
- Demasiados dashboards abiertos a la vez
- Cardinalidad explosiva: labels por pod/veth/IP efímeros

## Solution

**Cardinalidad explosiva: labels por pod/veth/IP efímeros** es la respuesta correcta: Las series por entidad efímera (hash de pod, veth, IP) se acumulan indefinidamente. La regla de oro de la observabilidad de red es etiquetar por lo ESTABLE (namespace/workload), no por lo efímero.
