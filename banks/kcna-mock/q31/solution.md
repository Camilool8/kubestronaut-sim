**kubelet** is correct: the kubelet is the node agent that watches for pods assigned to its node and calls the container runtime over the Container Runtime Interface (CRI) to pull images and start, stop, and monitor containers. The runtime (containerd or CRI-O) then uses a low-level runtime such as runc to actually create the container processes.

Why the others are wrong:

- **kube-apiserver** — the API server is the control-plane front end that clients and node agents talk to; it never connects to a node's container runtime directly.
- **kube-scheduler** — the scheduler only decides which node a pod should run on and records that decision through the API server; it plays no part in launching the containers.
- **kube-proxy** — kube-proxy manages Service networking rules on the node and has nothing to do with the lifecycle of containers.
