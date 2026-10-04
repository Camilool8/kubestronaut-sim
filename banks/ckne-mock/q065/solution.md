**SNAT/masquerade: the source IP becomes the node's IP** is correct: CNIs apply masquerade for destinations outside the cluster CIDRs: the external server sees the node's IP. This is tunable (e.g., `ip-masq-agent` with nonMasqueradeCIDRs) when pod IPs are routable on the company network.

Why the others are wrong:

- **None — the pod IP is always internet-routable** — pod CIDRs are private ranges unknown to the outside world; a reply to a raw pod IP would have nowhere to go, which is why SNAT exists.
- **It is converted to IPv6** — the address family is not changed on egress; NAT64 is a separate, deliberate deployment, not a default.
- **Traffic is blocked by default** — pods reach the internet by default (pulling images, calling APIs) — egress is open unless a NetworkPolicy or firewall says otherwise.
