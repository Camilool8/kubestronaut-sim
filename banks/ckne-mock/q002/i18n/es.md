## Question

¿Qué componente de Kubernetes es responsable de asignar un podCIDR a cada nodo cuando está habilitado el flag --allocate-node-cidrs=true?

## Options

- kubelet
- kube-controller-manager
- kube-scheduler en el momento de vincular el pod
- kube-proxy en modo IPVS

## Solution

**kube-controller-manager** es la respuesta correcta: El `kube-controller-manager` (mediante el controlador NodeIPAM) divide el `--cluster-cidr` en subredes y asigna un `spec.podCIDR` a cada nodo. Algunos CNI (por ejemplo, Calico con su propio IPAM o Cilium cluster-pool) ignoran este campo y utilizan su propio IPAM.
