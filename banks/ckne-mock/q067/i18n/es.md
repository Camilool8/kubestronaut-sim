## Question

Entre dos pods, ping (ICMP) funciona, pero las conexiones TCP al puerto 8080 fallan. ¿Cuáles son las dos causas más probables que debe investigar?

## Options

- Una NetworkPolicy L4 restrictiva o un problema de MTU/PMTUD
- ICMP está deshabilitado en el kernel de ambos nodos
- DNS está caído en el namespace del pod
- El pod necesita privilegios root

## Solution

**Una NetworkPolicy L4 restrictiva o un problema de MTU/PMTUD** es la respuesta correcta: ICMP pequeño puede atravesar rutas que descartan paquetes grandes por MTU y las policies pueden tratarlo de forma distinta. Pruebe con `nc -zv`, compare payloads pequeños y grandes (¿se bloquea `curl` con archivos mayores?) y revise las policies L4.
