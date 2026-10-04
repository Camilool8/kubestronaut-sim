**Runtimes don't create named netns; use lsns -t net** is correct: `ip netns` only sees named netns (bind-mounted in /var/run/netns). Runtimes create anonymous per-process netns; `lsns -t net` lists them with PIDs, enabling `nsenter -t PID -n` for inspection.

Why the others are wrong:

- **Because the command was deprecated** — `ip netns` is current and maintained; it simply looks only in `/var/run/netns`, where runtimes register nothing.
- **Because you must be root and use sudo twice** — privileges are not the issue — even as root the command lists nothing, because there are no named entries to list.
- **Because pods don't use namespaces** — every non-hostNetwork pod has its own network namespace; that is exactly what `lsns -t net` reveals.
