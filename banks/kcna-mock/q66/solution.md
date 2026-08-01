**`kubectl logs <pod> --previous`** is correct: `CrashLoopBackOff` means the container has already exited at least once and Kubernetes is delaying the next restart attempt. By the time you look, the current container instance may not exist yet (or may not have produced output before crashing again), but the PREVIOUS instance's stdout/stderr — where the application's own error, stack trace, or panic message usually lives — is exactly what `--previous` retrieves.

Why the others are wrong:

- **`kubectl get events --field-selector involvedObject.kind=Deployment`** — scoping events to the Deployment object skips the Pod-level events that actually carry the crash reason, and neither shows the application's own log output, which is normally the fastest way to find a crash's root cause.
- **`kubectl top pod`** — this reports live CPU and memory usage snapshots; it says nothing about why a specific container process exited, and a crash-looping Pod may not even be running at the moment `top` samples it.
- **`kubectl rollout restart deployment`** — this only forces new Pods to be created; it does nothing to reveal the cause of the crash, and if the underlying problem is unchanged, the new Pods will crash-loop identically.
