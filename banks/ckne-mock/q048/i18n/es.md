## Question

Para rastrear una solicitud de extremo a extremo a través de gateway → servicio A → servicio B, ¿qué patrón/tecnología se utiliza y qué debe propagarse?

## Options

- Ping con timestamps sincronizados mediante NTP
- Polling SNMP en los switches
- kubectl logs -f en todos los pods
- Tracing distribuido propagando el header traceparent

## Solution

**Tracing distribuido propagando el header traceparent** es la respuesta correcta: El tracing distribuido correlaciona los spans de cada salto; si no se propaga el header `traceparent` (W3C Trace Context), los spans quedan huérfanos. Es la herramienta adecuada para localizar dónde se produce la latencia.
