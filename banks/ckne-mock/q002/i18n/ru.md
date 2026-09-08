## Question

Какой компонент Kubernetes отвечает за выделение podCIDR каждому узлу, когда включён флаг --allocate-node-cidrs=true?

## Options

- kubelet
- kube-controller-manager
- kube-scheduler во время привязки pod
- kube-proxy в режиме IPVS

## Solution

**kube-controller-manager** — правильный ответ: `kube-controller-manager` через контроллер NodeIPAM делит `--cluster-cidr` на подсети и назначает каждому узлу `spec.podCIDR`. Некоторые CNI, например Calico с собственным IPAM или Cilium cluster-pool, игнорируют это поле и используют собственный IPAM.
