## Question

Después de concentrar todo el egress en un único egressIP, las conexiones externas empiezan a fallar de forma intermitente en los picos con errores "cannot assign requested address" en el gateway. ¿Qué límite se alcanzó?

## Options

- El límite DNS
- El límite de ancho de banda del kernel en el nodo gateway
- El límite de pods por nodo
- Agotamiento de puertos de origen SNAT

## Solution

**Agotamiento de puertos de origen SNAT** es la respuesta correcta: SNAT multiplexa todo en (egressIP, puerto): la tupla (proto, srcIP, srcPort, dst) debe ser única. A escala, se agotan los aproximadamente 64 000 puertos: port exhaustion, el síntoma típico de un embudo NAT centralizado.
