**pwru (packet, where are you?)** is correct: `pwru` (from Cilium) instruments the kernel with eBPF and prints the packet's journey function by function (netfilter hooks, routes, tc), including the drop reason/location — solving cases where tcpdump shows the packet entering but never leaving.

Why the others are wrong:

- **a detailed kubectl describe pod** — `describe` shows the pod's spec, events and conditions from the API; it never observes packets.
- **df -h** — reports disk usage.
- **top** — shows processes and CPU; it has no visibility into the kernel network path.
