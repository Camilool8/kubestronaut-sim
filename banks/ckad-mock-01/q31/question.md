Deployment `feed-api` in Namespace `pyxis` runs `nginx:1.27-alpine` with
3 ready replicas.

A new image has been approved, but the release window has not opened yet.
Stage the change first and let it out afterwards, in this order:

1. Pause the rollout of `feed-api`.
2. **While it is paused**, change the container's image to
   `nginx:1.29-alpine`. No Pod may be replaced by this.
3. **Still while it is paused**, count the ReplicaSets in Namespace
   `pyxis` and save that number — digits only — to
   `/opt/course/31/replicasets-while-paused` on `instance-1`.
4. Resume the rollout and wait until it finishes.

At the end `feed-api` must run `nginx:1.29-alpine` with 3 ready
replicas, and must no longer be paused.
