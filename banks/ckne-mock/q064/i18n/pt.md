## Question

Um nó recém-adicionado permanece NotReady com a condição "container runtime network not ready: cni plugin not initialized". O que verificar?

## Options

- Se o etcd está compactado e sem alarmes de espaço
- Se o node tem GPU
- Se o DaemonSet do CNI roda no nó e há config em /etc/cni/net.d/
- Se o kube-scheduler está no nó

## Solution

**Se o DaemonSet do CNI roda no nó e há config em /etc/cni/net.d/** é a resposta correta: Essa condição indica que o kubelet não encontrou um CNI funcional: normalmente o pod do CNI (DaemonSet) não subiu no nó (taints, image pull) ou não escreveu a config. Sem CNI, apenas pods hostNetwork conseguem rodar.
