## Question

Para rastrear uma requisição fim-a-fim através de gateway → serviço A → serviço B, qual padrão/tecnologia é usado, e o que precisa ser propagado?

## Options

- Ping com timestamps sincronizados por NTP
- SNMP polling nos switches
- kubectl logs -f em todos os pods
- Tracing distribuído propagando o header traceparent

## Solution

**Tracing distribuído propagando o header traceparent** é a resposta correta: Tracing distribuído correlaciona spans de cada salto; sem propagar o header `traceparent` (W3C Trace Context), os spans ficam órfãos. É a ferramenta certa para achar onde a latência acontece.
