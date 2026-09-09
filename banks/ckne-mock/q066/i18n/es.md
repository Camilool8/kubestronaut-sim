## Question

¿Cuál es la prueba más rápida para validar al mismo tiempo DNS y la conectividad básica de un cluster nuevo?

## Options

- ping 8.8.8.8 desde su máquina
- kubectl get nodes -o wide comprobando INTERNAL-IP y versión
- kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default
- kubectl top pods --containers en todo kube-system

## Solution

**kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default** es la respuesta correcta: Este one-liner crea un pod, resuelve `kubernetes.default` —probando resolv.conf, search domains, CoreDNS y el Service kube-dns— y elimina el pod al salir. Los fallos aquí apuntan directamente al subsistema DNS/CNI.
