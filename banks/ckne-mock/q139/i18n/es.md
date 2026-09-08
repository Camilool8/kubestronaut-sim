## Question

Durante la depuración, `kubectl port-forward svc/my-api 8080:80` funciona, pero en producción los pods no pueden llamar al mismo Service. ¿Por qué port-forward NO valida la ruta real?

## Options

- Es un túnel directo hacia UN pod mediante el apiserver, fuera de la ruta del Service
- Producción siempre utiliza otro cluster y otra imagen
- port-forward utiliza UDP
- port-forward es más lento

## Solution

**Es un túnel directo hacia UN pod mediante el apiserver, fuera de la ruta del Service** es la respuesta correcta: El túnel de port-forward omite el datapath del Service. Puede funcionar con DNS roto, policies bloqueantes y kube-proxy caído. Para validar la ruta real, pruebe desde DENTRO de un pod.
