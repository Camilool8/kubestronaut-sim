## Question

El dashboard muestra una explosión de NXDOMAIN en CoreDNS y el equipo sospecha un ataque. Las consultas tienen la forma api.stripe.com.default.svc.cluster.local. ¿Cuál es el diagnóstico correcto?

## Options

- CoreDNS se quedó sin memoria
- CoreDNS fue comprometido
- Un ataque de DNS tunneling
- Comportamiento normal de ndots:5: los nombres externos se expanden por los search domains y generan NXDOMAIN legítimos antes de la respuesta correcta

## Solution

**Comportamiento normal de ndots:5: los nombres externos se expanden por los search domains y generan NXDOMAIN legítimos antes de la respuesta correcta** es la respuesta correcta: Antes de declarar un "ataque", observe el SUFIJO de las consultas fallidas: si son nombres externos más search domains, se trata de ndots. Las métricas NXDOMAIN necesitan este contexto para evitar alertas falsas.
