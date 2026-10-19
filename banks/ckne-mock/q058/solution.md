**conntrack -L | grep `<pod-IP>`** is correct: `conntrack -L` lists the kernel connection-tracking table: you see the original tuple (pod→ClusterIP) and the translated one (pod→endpoint) after kube-proxy's DNAT — essential to confirm the Service NAT is happening.

Why the others are wrong:

- **free -m** — reports memory usage; it says nothing about network flows.
- **lsof -i** — lists sockets opened by processes on the host with their un-translated addresses — it cannot show what NAT did to a packet after it left the socket.
- **systemctl status conntrack** — there is no conntrack service to query; connection tracking is a kernel subsystem, and its table is read with the `conntrack` tool, not through systemd.
