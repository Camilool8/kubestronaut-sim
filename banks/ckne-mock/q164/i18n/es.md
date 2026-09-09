## Question

Después de reiniciar un pod, el gráfico de rate(container_network_transmit_bytes_total[5m]) para ese workload permanece correcto aunque el contador vuelva a cero. ¿Por qué?

## Options

- La función rate() detecta los resets del contador
- Prometheus prohíbe los reinicios
- Los contadores nunca se reinician
- kubelet vuelve a enviar los datos antiguos

## Solution

**La función rate() detecta los resets del contador** es la respuesta correcta: Semántica esencial de PromQL: `rate()`/`increase()` gestionan los resets asumiendo continuidad. Hacer aritmética manual con contadores brutos se rompe en cada reinicio, un error común en consultas creadas a mano.
