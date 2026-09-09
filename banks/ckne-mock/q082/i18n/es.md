## Question

Los endpoints del Service son correctos y la comunicación directa pod-a-pod por IP funciona, pero el acceso mediante ClusterIP falla desde todos los pods de un nodo específico. ¿Cuál es el principal sospechoso?

## Options

- CoreDNS está caído en todas las réplicas
- kube-proxy de ese nodo está caído o no programó las reglas
- El namespace se está eliminando en segundo plano
- La imagen del contenedor es incorrecta

## Solution

**kube-proxy de ese nodo está caído o no programó las reglas** es la respuesta correcta: ClusterIP se materializa POR NODO (iptables/IPVS/eBPF). Si un único nodo no puede alcanzar los VIP, la programación local está rota: kube-proxy se cae, las reglas no se sincronizaron o existe un conflicto con el firewall local. Compare `iptables-save` entre nodos.
