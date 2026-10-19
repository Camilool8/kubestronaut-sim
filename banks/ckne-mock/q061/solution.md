**cluster-cidr and service-cluster-ip-range with two blocks** is correct: Dual-stack requires dual CIDRs in the control plane, a compatible CNI and, per Service, the `ipFamilyPolicy` field (SingleStack, PreferDualStack, RequireDualStack) + `ipFamilies`. Pods get one IP of each family in `status.podIPs`.

Why the others are wrong:

- **Just swapping the CNI** — the CNI must support dual-stack, but the control plane also has to hand out addresses of both families — without dual CIDRs no CNI can give pods a second address.
- **Dual-stack is not supported in Kubernetes** — dual-stack has been GA since Kubernetes 1.23; pods carry `status.podIPs` with one address per family.
- **Only adding AAAA records to CoreDNS** — CoreDNS serves AAAA records for whatever addresses Services and pods already have; adding records does not create the IPv6 addresses they would point to.
