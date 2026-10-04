**crictl inspect to get the PID, then nsenter -t `<PID>` -n** is correct: `crictl ps` + `crictl inspect --output go-template --template '{{.info.pid}}'` give the PID; `nsenter -t PID -n ip addr` (or ss, tcpdump…) runs commands inside the pod netns using the host's tools.

Why the others are wrong:

- **Restart the kubelet with --debug-netns** — no such kubelet flag exists, and restarting the kubelet to debug one pod is disruptive for nothing.
- **Editing the node's /etc/network/interfaces and reloading** — that file configures the node's own interfaces on Debian-style hosts; it has nothing to do with a pod's namespace, and reloading it can take the node off the network.
- **ssh directly to the pod IP** — pods run no SSH daemon, and even if one did you would be inside the container, not using the host's tooling in its netns.
