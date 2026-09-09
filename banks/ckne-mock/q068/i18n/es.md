## Question

¿Por qué `ip netns list` en el nodo suele devolver vacío incluso con decenas de pods ejecutándose, y qué comando muestra los namespaces de red reales?

## Options

- Porque el comando fue deprecado
- Los runtimes no crean netns con nombre; utilice lsns -t net
- Porque debe ser root y ejecutar sudo dos veces
- Porque los pods no utilizan namespaces

## Solution

**Los runtimes no crean netns con nombre; utilice lsns -t net** es la respuesta correcta: `ip netns` solo detecta netns con nombre (bind-mounted en /var/run/netns). Los runtimes crean netns anónimos por proceso; `lsns -t net` los muestra con sus PID, permitiendo inspeccionarlos mediante `nsenter -t PID -n`.
