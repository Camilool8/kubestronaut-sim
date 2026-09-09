## Question

kubectl exec dentro del pod muestra eth0 UP con la IP correcta, pero no entra ni sale NADA. En el nodo, `ip link` muestra el peer veth en estado LOWERLAYERDOWN. ¿Qué indica esto?

## Options

- LOWERLAYERDOWN es el estado normal
- El pod necesita más CPU
- DNS está mal configurado
- Un problema en el otro extremo del par veth

## Solution

**Un problema en el otro extremo del par veth** es la respuesta correcta: veth es un cable con dos extremos: si el extremo del host cae o sale del bridge, el enlace del pod pierde su capa física. Estados como `LOWERLAYERDOWN` apuntan al lado del host, no al interior del pod.
