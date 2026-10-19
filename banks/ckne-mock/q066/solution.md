**kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default** is correct: This one-liner creates a pod, resolves `kubernetes.default` (exercising resolv.conf, search domains, CoreDNS and the kube-dns Service) and removes the pod on exit. Failures here point straight at the DNS/CNI subsystem.

Why the others are wrong:

- **ping 8.8.8.8 from your machine** — exercises your workstation's network, not the cluster's; it says nothing about pod DNS or the CNI.
- **kubectl get nodes -o wide checking INTERNAL-IP and version** — shows node addresses and versions from the API server's point of view; a node can be Ready with a broken overlay or a dead CoreDNS.
- **kubectl top pods --containers across kube-system** — reports CPU and memory from metrics-server; resource usage is not connectivity.
