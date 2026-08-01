**Every pod gets its own IP address and can reach any other pod directly without NAT** is correct: Kubernetes defines a flat network model in which each pod receives a unique cluster-wide IP, and pods can communicate with each other across nodes using those IPs without network address translation. The CNI plugin is responsible for making this model work on the underlying infrastructure.

Why the others are wrong:

- **Pods must communicate through a NodePort Service, even inside the cluster** — NodePort exists to expose Services on node ports for traffic from outside the cluster; internal pod-to-pod traffic never requires it.
- **Pods on different nodes cannot communicate unless an Ingress is created** — Ingress deals with routing external HTTP(S) traffic into the cluster and is irrelevant to communication between pods.
- **Traffic between pods on different nodes must pass through the kube-apiserver** — the API server handles control-plane requests only; application traffic between pods flows over the pod network and never transits the API server.
