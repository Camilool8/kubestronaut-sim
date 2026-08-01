**Raise the container's `resources.limits.memory`, or reduce the application's memory footprint** is correct: `OOMKilled` means the kernel's cgroup out-of-memory killer terminated the container because it tried to use more memory than its cgroup was allowed — the ceiling set by `resources.limits.memory` (or the node's available memory, if no limit is set). Exit code 137 is the standard signal-9 (SIGKILL) encoding, consistent with a forced kill rather than a graceful exit. The fix is either to give the container more headroom or to make it use less.

Why the others are wrong:

- **Increase the `livenessProbe`'s `failureThreshold`** — a liveness probe failing produces a restart with a "Liveness probe failed" event and normally exit code 0 or a signal from the probe's own kill, not `OOMKilled`; adjusting probe tolerance does nothing about a real memory ceiling being hit.
- **Add a `startupProbe` to give the application more time to initialize** — a startup probe delays when liveness/readiness begin checking; it does not change how much memory the container is allowed to use, so it cannot prevent an out-of-memory kill.
- **Change the container's `imagePullPolicy` to `Always`** — pull policy only controls when the kubelet re-fetches an image; it has no relationship to a running container's memory usage or an OOM kill.
