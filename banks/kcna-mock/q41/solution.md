**No node has enough allocatable CPU to satisfy the pod's CPU request** is correct: `Pending` with a `FailedScheduling` event means the scheduler could not find any node that fits the pod, and `3 Insufficient cpu` says explicitly that on all three nodes the remaining allocatable CPU is smaller than the pod's CPU request. The fix is to lower the request, free up capacity, or add nodes (which is what the Cluster Autoscaler automates).

Why the others are wrong:

- **The container image could not be pulled from the registry** — image pull problems happen after scheduling, on the assigned node, and surface as `ErrImagePull`/`ImagePullBackOff`, not as a `FailedScheduling` event on a `Pending` pod.
- **The application inside the container is crashing after startup** — a crashing application implies the pod was scheduled and started, which would show `CrashLoopBackOff`, not `Pending`.
- **The pod's liveness probe is failing** — probes only run against containers that are already started; a pod that was never scheduled has no containers for the kubelet to probe.
