## Question

Was ist der Standard-Portbereich für NodePort-Services?

## Options

- 8000–9000
- 30000–32767
- 1024–2048
- 49152–65535

## Solution

**30000–32767** ist die richtige Antwort: Standard ist `30000–32767`, konfigurierbar am kube-apiserver mit `--service-node-port-range`. Jeder NodePort wird auf jedem Node geöffnet und leitet zu den Service-Endpoints.
