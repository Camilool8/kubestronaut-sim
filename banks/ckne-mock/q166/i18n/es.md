## Question

Un cliente de alto throughput hacia el mismo destino empieza a fallar con "cannot assign requested address"; `ss -s` dentro del pod muestra decenas de miles de conexiones TIME_WAIT. ¿Cuál es el problema?

## Options

- El kernel está corrupto
- MTU baja
- Falta DNS
- Agotamiento de puertos efímeros

## Solution

**Agotamiento de puertos efímeros** es la respuesta correcta: El patrón "abrir-cerrar por solicitud" agota al cliente antes que al servidor: unos 28 000 puertos efímeros ÷ 60 s de TIME_WAIT ≈ un límite de unas 470 conexiones nuevas/s por destino. El pooling lo corrige en la arquitectura, no en sysctl.
