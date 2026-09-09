## Question

Ihr Netzwerk-Grafana pro Pod hat Millionen Serien und Prometheus verbraucht Dutzende GB. Die größte Quelle des Problems ist meist:

## Options

- Das dunkle Grafana-Theme
- Diagramme mit zu vielen Farben
- Zu viele gleichzeitig geöffnete Dashboards
- Explodierende Kardinalität: Labels pro flüchtigem Pod/veth/IP

## Solution

**Explodierende Kardinalität: Labels pro flüchtigem Pod/veth/IP** ist die richtige Antwort: Serien pro flüchtiger Entität (Pod-Hash, veth, IP) akkumulieren durch Churn endlos. Goldene Regel der Netz-Observability: nach dem STABILEN labeln (Namespace/Workload), volatile Labels per Relabeling droppen, Per-Interface-Metriken begrenzen.
