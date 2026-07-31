**A sidecar container** is correct: a sidecar is a helper container that runs alongside the main application container within the same Pod for the Pod's whole lifetime, extending it with capabilities like log shipping, proxying, or metrics collection. Because it shares the Pod's network and volumes, it can read the app's log files directly. In current Kubernetes, native sidecars are implemented as init containers with a restart policy of Always, but the pattern is still called a sidecar.

Why the others are wrong:

- **An init container** — a plain init container runs to completion before the app containers start; it is for one-time setup work, not for a helper that must keep running alongside the application.
- **An ephemeral container** — ephemeral containers are injected temporarily into a running Pod for interactive debugging; they are not part of the Pod spec's normal, long-running workload.
- **A static Pod** — a static Pod is a whole Pod managed directly by the kubelet from a file on the node (used for control plane components), not a container role inside another Pod.
