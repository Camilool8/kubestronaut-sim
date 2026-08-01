**It kills the container and restarts it, subject to the pod's restart policy** is correct: a liveness probe exists to detect containers that are still alive as processes but no longer working — deadlocked, hung, or otherwise stuck. Once the probe has failed more times than the failure threshold allows, the kubelet kills the container and starts a new instance of it in the same pod, on the same node, following the pod's `restartPolicy`. Only the failing container is recreated; the pod object keeps its name, IP, and node assignment.

Why the others are wrong:

- **It removes the pod from the endpoints of Services that select it, but leaves the container running** — being pulled out of Service endpoints is the consequence of a failing *readiness* probe; liveness failures trigger a restart, not a quiet removal from load balancing.
- **It marks the node as NotReady so no further pods are scheduled onto it** — node readiness reflects the health of the node and its kubelet heartbeats; one application container failing its probe says nothing about the node and never changes node status.
- **It deletes the pod so the scheduler can recreate it on a different node** — the kubelet never deletes or reschedules pods over probe failures; restarts happen in place, and moving a pod to another node would require a controller to replace the pod entirely.
