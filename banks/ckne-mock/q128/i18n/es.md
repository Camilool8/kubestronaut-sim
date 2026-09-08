## Question

Dos contenedores del MISMO pod intentan escuchar en el puerto 8080. ¿Qué ocurre?

## Options

- Funciona: cada contenedor tiene su propio namespace de red
- kubelet crea una segunda IP
- El tráfico se balancea entre ellos
- El segundo falla con "address already in use"

## Solution

**El segundo falla con "address already in use"** es la respuesta correcta: El netns pertenece al sandbox (pause container); todos los contenedores del pod lo comparten. Por eso localhost funciona entre ellos y los puertos entran en conflicto.
