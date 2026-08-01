**kubectl describe pod web-0** is correct: `kubectl describe` prints a detailed, human-readable view of the object, including the Events section at the bottom. For a Pending Pod, that section typically contains scheduler messages such as `FailedScheduling` with the reason (insufficient CPU, untolerated taints, unbound PVCs, and so on), which is exactly what you need to diagnose the problem.

Why the others are wrong:

- **kubectl logs web-0** — logs come from a running (or previously run) container's stdout/stderr; a Pending Pod has not started any containers yet, so there are no logs to show.
- **kubectl exec web-0 -- ps aux** — `exec` runs a command inside a running container, which is impossible while the Pod is still Pending and unscheduled.
- **kubectl get pod web-0 -o wide** — this adds columns like node and IP to the list view, but it does not display the event history that explains a scheduling failure.
