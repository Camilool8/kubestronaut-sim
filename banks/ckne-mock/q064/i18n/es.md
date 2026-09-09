## Question

Un nodo recién añadido permanece NotReady con la condición "container runtime network not ready: cni plugin not initialized". ¿Qué debe comprobar?

## Options

- Si etcd está compactado y sin alarmas de espacio
- Si el nodo tiene una GPU
- Si el DaemonSet del CNI se ejecuta en el nodo y existe una configuración en /etc/cni/net.d/
- Si kube-scheduler está en el nodo

## Solution

**Si el DaemonSet del CNI se ejecuta en el nodo y existe una configuración en /etc/cni/net.d/** es la respuesta correcta: Esa condición significa que kubelet no encontró un CNI funcional: normalmente el pod del CNI (DaemonSet) no arrancó en el nodo por taints o image pull, o no escribió la configuración. Sin CNI, solo pueden ejecutarse pods hostNetwork.
