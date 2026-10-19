**A dedicated east-west gateway exposes services across clusters (mTLS)** is correct: When pods of different clusters can't reach each other directly, Istio routes cross-cluster traffic through east-west gateways (a dedicated LoadBalancer), keeping mTLS and unified endpoint discovery across networks.

Why the others are wrong:

- **One NodePort per service opened in every cluster** — NodePorts expose individual Services on node addresses without mesh identity, mTLS or discovery; they are not how Istio joins networks.
- **Permanent kubectl port-forward** — port-forward is a debugging tunnel through the API server for one client; it is neither scalable nor part of any data path.
- **VPN on developers' laptops** — developer VPNs connect people to clusters; they do not connect workloads to each other.
