**The dashed IP: 10-244-1-5.default.pod.cluster.local** is correct: The format `a-b-c-d.ns.pod.cluster.local` exists, but it embeds the IP itself — useless for discovering pods. Stable pod discovery = headless Service (StatefulSet).

Why the others are wrong:

- **pod-name.cluster.local** — no bare `pod-name` record exists; pod names are not published in DNS.
- **pods.default.svc** — not a record format; `pods.default.svc` would be a Service named `pods`.
- **No record is ever created for pods** — the dashed-IP record does exist, even if it is useless for discovery.
