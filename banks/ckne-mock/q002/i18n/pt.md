## Question

Qual componente do Kubernetes é responsável por alocar um podCIDR para cada nó quando a flag --allocate-node-cidrs=true está habilitada?

## Options

- kubelet
- kube-controller-manager
- kube-scheduler no bind do pod
- kube-proxy em modo IPVS

## Solution

**kube-controller-manager** é a resposta correta: O `kube-controller-manager` (via NodeIPAM controller) divide o `--cluster-cidr` em sub-redes e atribui um `spec.podCIDR` a cada nó. Alguns CNIs (ex.: Calico com IPAM próprio, Cilium cluster-pool) ignoram esse campo e usam IPAM próprio.
