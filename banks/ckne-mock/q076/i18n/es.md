## Question

Además de los registros A, ¿qué tipo de registro DNS crea Kubernetes para los puertos con nombre de un Service y con qué formato?

## Options

- Registros TXT con el YAML del Service
- SRV con el formato _puerto._proto.servicio.ns.svc.cluster.local
- Registros MX para cada puerto con nombre del Service
- Registros NS por namespace

## Solution

**SRV con el formato _puerto._proto.servicio.ns.svc.cluster.local** es la respuesta correcta: Para cada puerto con nombre se crea un SRV `_http._tcp.my-svc.default.svc.cluster.local` que devuelve el puerto y el host. Las aplicaciones pueden descubrir el puerto dinámicamente mediante SRV, sin hardcoding.
