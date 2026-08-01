**Setting `runAsNonRoot: true` in the securityContext** is correct: with this field set on the pod or container securityContext, the kubelet validates the user the container would run as and refuses to start it if that user is root (UID 0). It is typically paired with `runAsUser` to pin a specific non-root UID, and it directly implements the least-privilege requirement in the question.

Why the others are wrong:

- **Setting `hostNetwork: true` in the pod spec** — this places the pod in the node's network namespace, which increases the pod's privileges rather than restricting them, and says nothing about which user the container runs as.
- **Adding a NetworkPolicy that denies ingress traffic** — a NetworkPolicy filters network connections between pods; it has no effect on the Linux user identity inside the container.
- **Setting `imagePullPolicy: Always` on the container** — this only controls when the image is re-pulled from the registry and does not constrain the user the container process runs as.
