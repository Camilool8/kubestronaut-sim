## Question

Какой pattern/technology применяется для сквозного tracing запроса через gateway → service A → service B и что необходимо передавать?

## Options

- Ping с timestamps, синхронизированными NTP
- SNMP polling коммутаторов
- kubectl logs -f на всех pods
- Распределённый tracing с передачей header traceparent

## Solution

**Распределённый tracing с передачей header traceparent** — правильный ответ: Распределённый tracing связывает spans каждого hop; без передачи header `traceparent` (W3C Trace Context) spans становятся изолированными. Это правильный инструмент для поиска места возникновения задержки.
