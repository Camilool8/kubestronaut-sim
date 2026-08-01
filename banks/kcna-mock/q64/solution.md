**The image tag in the Pod's spec does not exist in the referenced registry, or the cluster lacks credentials to pull it** is correct: `ImagePullBackOff` means the kubelet tried to pull the container image and failed, then began backing off between retries. The two overwhelmingly common causes are a typo'd or nonexistent tag/repository and missing or wrong `imagePullSecrets` for a private registry — both stop the pull before the container can ever be created, which is why `RESTARTS` still reads 0.

Why the others are wrong:

- **The container's process exited immediately after starting** — that produces a `CrashLoopBackOff` status with a rising restart count, since the container did start (however briefly); `ImagePullBackOff` means the image never arrived.
- **The Pod's resource requests exceed every node's allocatable capacity** — that keeps the Pod `Pending` with a `FailedScheduling` event, never `Running` long enough to reach an image-pull step, and this Pod has clearly been assigned to a node already.
- **A livenessProbe is repeatedly failing and restarting the container** — a failing liveness probe also produces visible restarts and a running (if unhealthy) container, not a status that says the image itself could not be retrieved.
