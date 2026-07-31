**kubectl rollout undo deployment/web** is correct: Deployments keep a revision history, and `kubectl rollout undo` rolls the Deployment back to its previous revision (or to a specific one with `--to-revision`). The Deployment controller then performs a normal rollout back to the last working Pod template, restoring the previous image without deleting the Deployment or losing its configuration.

Why the others are wrong:

- **kubectl delete deployment web** — Deleting the Deployment removes the application entirely, including its revision history and running Pods, causing an outage instead of restoring the working version.
- **kubectl scale deployment web --replicas=0** — Scaling to zero stops all Pods, healthy or not; it changes how many replicas run, not which version of the Pod template they use.
- **kubectl rollout restart deployment/web** — A restart re-creates Pods using the current (broken) Pod template, so the new Pods would simply crash-loop again with the same faulty image.
