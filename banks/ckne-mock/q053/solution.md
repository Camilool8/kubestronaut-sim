**Packet loss on the path (MTU/fragmentation, full queues, bad link) forcing TCP retransmissions** is correct: TCP retransmissions = packet loss. Frequent culprit: wrong MTU with an overlay (VXLAN consumes ~50 bytes). Validate with `ping -M do -s 1472`, `tcpdump` and the CNI's MTU.

Why the others are wrong:

- **That DNS is slow** — slow DNS delays connection setup, not the data transfer; retransmitted segments are packets lost after the connection exists.
- **That etcd needs compaction** — etcd compaction affects control-plane storage; pods talking to each other never involve it.
- **That the Deployment lacks replicas** — under-provisioned replicas raise latency through queuing at the application; the kernel would not retransmit segments because a Deployment is small.
