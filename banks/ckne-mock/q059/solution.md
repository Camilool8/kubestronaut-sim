**tcpdump -i any -n port 53 and host 10.0.1.5** is correct: `-i any` covers all interfaces (useful when you don't know the veth), `port 53` filters DNS (UDP and TCP) and `host 10.0.1.5` narrows to the pod. Add `-vvv` to see queried names and response rcodes.

Why the others are wrong:

- **tcpdump -i lo udp port 53 -c 100** — `lo` is the host loopback, which a pod's DNS queries never cross; it also drops TCP fallback and stops after 100 packets.
- **tcpdump -n tcp port 80 and host 10.0.1.5** — filters HTTP, not DNS — port 80 over TCP, with no name-resolution traffic in it.
- **tcpdump -i eth0 icmp and host 10.0.1.5** — ICMP is ping and error messages; DNS rides UDP and TCP on port 53, and `eth0` misses traffic that stays on the node.
