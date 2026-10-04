**iperf3 between pods on the two nodes, compared with the same-node case** is correct: Without a baseline, every debate is opinion. The iperf3 pair measures the datapath's real ceiling (including encapsulation/encryption overhead); the same-node vs. cross-node comparison isolates where the degradation lives.

Why the others are wrong:

- **kubectl top nodes during peak hours** — `kubectl top nodes` shows CPU and memory; it does not measure throughput or latency between two points.
- **Adding service replicas and watching the graphs** — adding replicas changes the workload under test; it produces no measurement of the path itself.
- **Reading the datacenter capacity documentation** — documentation states nominal capacity; the question is what the real path delivers after encapsulation, encryption and policy.
