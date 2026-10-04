**They can't filter by hostname/L7** is correct: The native API is L3/L4: no FQDN rules, HTTP methods, explicit deny, priority or logging. CNIs extend this — `toFQDNs` and HTTP rules in Cilium, `action: Deny/Log` in Calico. Policies apply without restarting pods.

Why the others are wrong:

- **They only apply to the kube-system namespace** — NetworkPolicy is a namespaced resource usable in any namespace; there is no restriction to system namespaces.
- **They require pod restarts on every change** — policies are applied by the CNI as they change; pods keep running and the new rules take effect on live traffic.
- **They don't work with TCP** — TCP is the most common protocol in policies; `ports[].protocol` accepts TCP, UDP and SCTP.
