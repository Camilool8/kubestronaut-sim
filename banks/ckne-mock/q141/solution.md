**The application binds only to localhost** is correct: Trap number 1 for "refused" with everything apparently right: loopback bind. DNAT delivers to the pod IP, where nobody listens. `ss -tlnp` inside the pod reveals it instantly.

Why the others are wrong:

- **kube-proxy is down on that node** — a dead kube-proxy on the node would fail the DNAT for every Service from that node; the Service is otherwise correct and the `ss` output shows the real cause inside the pod.
- **It needs hostNetwork** — hostNetwork changes which namespace the socket lives in; a loopback bind is unreachable from other hosts in either case.
- **Port 8080 is reserved by the kubelet** — the kubelet reserves no application ports; 8080 is free for the container.
