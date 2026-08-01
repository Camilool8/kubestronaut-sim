**The kube-apiserver** is correct: the API server is the front end of the Kubernetes control plane. All components — the scheduler, controllers, kubelets, and users — interact with the cluster by calling the API server, and the API server is the only component that talks directly to etcd to persist and retrieve cluster state. This hub-and-spoke design keeps etcd access centralized and consistent.

Why the others are wrong:

- **The kubelet** — the kubelet is a node agent that runs on every node; it watches the API server for Pods assigned to its node and never talks to etcd directly.
- **The kube-scheduler** — the scheduler decides which node each unscheduled Pod should run on, but it reads and writes that decision through the API server, not through etcd.
- **The kube-controller-manager** — it runs the built-in controllers (for example the ReplicaSet and Node controllers), all of which observe and update state via the API server rather than accessing etcd themselves.
