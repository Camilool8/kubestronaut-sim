**Identify the pod's veth interface on the host and run tcpdump -i vethXXXX** is correct: Each pod has a veth pair: one end inside the pod netns (eth0) and the other on the host (vethXXXX). Find the pair by comparing interface indexes and capture with `tcpdump -i vethXXXX`. Alternative: `nsenter -t <PID> -n tcpdump`.

Why the others are wrong:

- **tcpdump -i eth0 on the node, since all pod traffic passes through eth0 unchanged** — the node's eth0 only sees traffic that leaves the node, already mixed with every other pod's and, with an overlay, encapsulated — pod-to-pod traffic on the same node never crosses it.
- **It's not possible; tcpdump only works inside the pod** — the capture point is the host end of the veth pair (or the pod netns via `nsenter`), both reachable from the node without any tool inside the pod.
- **Run tcpdump -i lo, since pods use the host loopback** — pods have their own loopback inside their netns; the node's `lo` carries only host-local traffic, never a pod's.
