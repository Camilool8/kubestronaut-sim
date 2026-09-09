## Question

¿Cuál es la diferencia real entre hostPort (en el pod) y un Service NodePort?

## Options

- Son idénticos
- NodePort solo funciona en el cloud
- hostPort es más seguro y balancea mejor
- hostPort abre el puerto SOLO en el nodo donde se ejecuta el pod

## Solution

**hostPort abre el puerto SOLO en el nodo donde se ejecuta el pod** es la respuesta correcta: `hostPort` vincula pod↔nodo (las colisiones de puertos limitan el scheduling); NodePort es implementado por kube-proxy en todos los nodos. Confundirlos provoca "funciona en un nodo, falla en los demás".
