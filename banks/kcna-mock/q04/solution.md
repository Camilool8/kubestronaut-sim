**The smallest deployable unit in Kubernetes: one or more containers that share networking and storage** is correct: a Pod is the atomic unit Kubernetes schedules and runs. The containers inside a Pod share the same network namespace (one IP address, communicating over localhost) and can share volumes, which is what makes tightly coupled multi-container patterns like sidecars possible.

Why the others are wrong:

- **A physical or virtual machine that runs containerized workloads** — that describes a node. A node hosts many Pods; a Pod is the workload unit placed onto a node.
- **A lightweight virtual machine that isolates each container with its own kernel** — Pods are not virtual machines. Containers in a Pod share the host node's kernel; Pods provide grouping and shared namespaces, not hardware virtualization.
- **A controller that keeps a specified number of container replicas running** — that describes a ReplicaSet. A Pod is the object being managed, not the controller doing the managing.
