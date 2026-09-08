## Question

Welche Kubernetes-Komponente weist jedem Node einen podCIDR zu, wenn das Flag --allocate-node-cidrs=true aktiv ist?

## Options

- kubelet
- kube-controller-manager
- kube-scheduler
- kube-proxy

## Solution

**kube-controller-manager** ist die richtige Antwort: Der `kube-controller-manager` (NodeIPAM-Controller) zerlegt das `--cluster-cidr` in Subnetze und setzt `spec.podCIDR` pro Node. Manche CNIs (Calico mit eigenem IPAM, Cilium cluster-pool) ignorieren das Feld und nutzen eigenes IPAM.
