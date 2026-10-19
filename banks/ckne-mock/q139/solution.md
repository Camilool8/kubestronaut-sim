**A direct tunnel to ONE pod via the apiserver, off the Service path** is correct: The port-forward tunnel skips the Service datapath. It can work with broken DNS, blocking policies and a dead kube-proxy. To validate the real path, test from INSIDE a pod.

Why the others are wrong:

- **Production always uses another cluster and image** — port-forward works against the same cluster; the difference is the path it takes, not the environment.
- **port-forward uses UDP** — port-forward tunnels TCP over the API server's SPDY/WebSocket connection; UDP is not what makes it behave differently.
- **port-forward is slower** — speed is not the point; it can be slower and still succeed where the Service path fails.
