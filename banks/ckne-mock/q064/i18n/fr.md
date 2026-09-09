## Question

Un nœud fraîchement ajouté reste NotReady avec « container runtime network not ready: cni plugin not initialized ». Que vérifier ?

## Options

- Si etcd est compacté et sans alarmes d'espace
- Si le nœud a un GPU
- Le DaemonSet du CNI sur ce nœud et la config dans /etc/cni/net.d/
- Si kube-scheduler tourne sur le nœud

## Solution

**Le DaemonSet du CNI sur ce nœud et la config dans /etc/cni/net.d/** est la bonne réponse : Cette condition signifie que le kubelet n'a pas trouvé de CNI fonctionnel : en général le pod CNI (DaemonSet) n'a pas démarré (taints, image pull) ou n'a pas écrit la config. Sans CNI, seuls les pods hostNetwork tournent.
