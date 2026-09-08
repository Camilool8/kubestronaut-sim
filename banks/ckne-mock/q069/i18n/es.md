## Question

Las aplicaciones se quejan de lentitud al resolver nombres externos (por ejemplo, api.github.com) desde los pods. tcpdump muestra varias consultas NXDOMAIN antes de la respuesta correcta. ¿Cuál es la causa y la mitigación?

## Options

- CoreDNS está corrupto y responde tarde
- El TTL del registro es cero
- Expansión de ndots:5 mediante search domains (utilice un FQDN con punto final)
- Ancho de banda insuficiente entre los nodos y CoreDNS

## Solution

**Expansión de ndots:5 mediante search domains (utilice un FQDN con punto final)** es la respuesta correcta: Con `ndots:5`, cualquier nombre con menos de cinco puntos se expande por los search domains antes de realizar la consulta absoluta, generando entre tres y cinco consultas NXDOMAIN adicionales por resolución. Un punto final fuerza la consulta absoluta; `dnsConfig.options ndots:1` modifica el comportamiento por pod.
