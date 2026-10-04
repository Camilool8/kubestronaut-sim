**Broker, Gateway nodes and Lighthouse** is correct: The Broker (in one cluster or dedicated) syncs the endpoints; Gateway nodes establish encrypted tunnels between clusters (even with overlapping CIDRs, via Globalnet); Lighthouse resolves `clusterset.local`, implementing the MCS API.

Why the others are wrong:

- **Hub, Spoke and Wheel** — no Submariner component carries those names; they describe a generic hub-and-spoke topology.
- **Master, Worker and Etcd** — those are Kubernetes roles inside a single cluster, not the pieces that join clusters together.
- **Ingress, Egress and Midgress** — "Midgress" is not a thing, and ingress/egress are traffic directions, not Submariner components.
