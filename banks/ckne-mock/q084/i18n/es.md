## Question

¿Qué ocurre con las conexiones nuevas hacia un ClusterIP cuyo Service NO tiene endpoints ready?

## Options

- Se redirigen al apiserver
- Se rechazan inmediatamente (REJECT → "connection refused")
- Se quedan en cola en el kernel hasta que aparezca un pod
- Reciben un HTTP 404 generado por el propio kube-proxy

## Solution

**Se rechazan inmediatamente (REJECT → "connection refused")** es la respuesta correcta: kube-proxy instala una regla de rechazo para Services sin endpoints, por lo que el cliente recibe inmediatamente "connection refused". Distinguir refused (sin endpoints/puerto incorrecto) de timeout (policy/ruta/firewall) acelera mucho la resolución de problemas.
