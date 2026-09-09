## Question

En el Corefile de CoreDNS, ¿qué hace la línea `cache 30` dentro del bloque de servidor?

## Options

- Almacena respuestas en caché hasta 30 s y reduce la carga de los upstreams
- Limita cada pod a 30 consultas
- Aumenta el TTL de todos los registros a 30 minutos
- Crea 30 réplicas de CoreDNS

## Solution

**Almacena respuestas en caché hasta 30 s y reduce la carga de los upstreams** es la respuesta correcta: El plugin `cache` almacena respuestas satisfactorias y negativas durante el tiempo indicado como máximo, respetando TTL menores. Es uno de los ajustes con mayor impacto en el rendimiento DNS, junto con un número adecuado de réplicas de CoreDNS.
