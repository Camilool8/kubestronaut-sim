## Question

¿Cuál es el rango de puertos predeterminado asignado a los Services NodePort?

## Options

- 8000–9000
- 30000–32767
- 1024–2048
- 49152–65535

## Solution

**30000–32767** es la respuesta correcta: El valor predeterminado es `30000–32767`, configurable en kube-apiserver mediante `--service-node-port-range`. Cada NodePort se abre en todos los nodos y reenvía hacia los endpoints del Service.
