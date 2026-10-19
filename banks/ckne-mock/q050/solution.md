**Datapath flow logs (Hubble, Calico, VPC flow logs)** is correct: Common confusion: apiserver audit logs audit API operations. For network traffic, use CNI/datapath flow logs — source, destination, port, verdict, policy — exportable to a SIEM.

Why the others are wrong:

- **kube-scheduler logs** — scheduler logs record placement decisions; they say nothing about packets between pods.
- **kubectl get events** — events describe object lifecycle (scheduled, pulled, killed); no event is emitted for a network flow.
- **kube-apiserver audit log at RequestResponse level** — the audit log records every API request and response — an exhaustive record of the control plane, blind to the data plane.
