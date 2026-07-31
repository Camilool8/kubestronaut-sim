**kube-scheduler** and **etcd** are correct: the control plane consists of the kube-apiserver, etcd, the kube-scheduler, the kube-controller-manager, and optionally the cloud-controller-manager. etcd is the consistent key-value store holding all cluster state, and the kube-scheduler assigns newly created Pods to nodes — both are global, cluster-level responsibilities.

Why the others are wrong:

- **kubelet** — the kubelet is a node component; it runs on every node (including control plane nodes) as the agent that manages the Pods assigned to that specific node.
- **kube-proxy** — kube-proxy is a node component that maintains Service networking rules on each node; it makes no cluster-wide decisions.
- **The container runtime** — the runtime (such as containerd) is node-level software that executes containers under the kubelet's direction; it is not part of the control plane.
