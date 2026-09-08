## Question

Debe permitir únicamente GET /public/* en el servicio, bloqueando POST y otros paths mediante la network policy del CNI. ¿Qué se requiere?

## Options

- NetworkPolicy nativa con un campo httpRules para métodos HTTP
- Únicamente un firewall externo en el borde del datacenter
- Reglas L7 (por ejemplo, CiliumNetworkPolicy con toPorts.rules.http method/path)
- endPort cubriendo el rango de puertos HTTP es suficiente

## Solution

**Reglas L7 (por ejemplo, CiliumNetworkPolicy con toPorts.rules.http method/path)** es la respuesta correcta: Filtrar por método/path es L7: Cilium inyecta un proxy transparente para los flujos cubiertos por la regla. Implicación de examen: las policies L7 añaden un salto de proxy y latencia únicamente donde se aplican.
