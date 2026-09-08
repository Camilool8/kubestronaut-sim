## Question

El SLO de disponibilidad del gateway es 99,9 %/mes. ¿Qué estrategia de alerting evita tanto hacer paging por incidentes mínimos como descubrir demasiado tarde un consumo lento del error budget?

## Options

- Una única alerta fija al 1 % de errores
- Alertas burn-rate de múltiples ventanas
- Desactivar las alertas por la noche
- Alertar por cada error individual

## Solution

**Alertas burn-rate de múltiples ventanas** es la respuesta correcta: Burn rate = velocidad de consumo del error budget. La combinación de ventanas cortas y largas detecta incidentes agudos Y degradaciones lentas con muy pocos falsos positivos; es la práctica SRE canónica para SLO de red.
