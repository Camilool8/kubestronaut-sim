## Question

Quel composant Kubernetes attribue un podCIDR à chaque nœud quand le flag --allocate-node-cidrs=true est activé ?

## Options

- kubelet
- kube-controller-manager
- kube-scheduler
- kube-proxy

## Solution

**kube-controller-manager** est la bonne réponse : Le `kube-controller-manager` (contrôleur NodeIPAM) découpe le `--cluster-cidr` en sous-réseaux et assigne un `spec.podCIDR` par nœud. Certains CNI (Calico avec son IPAM, Cilium cluster-pool) ignorent ce champ et utilisent leur propre IPAM.
