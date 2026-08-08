Deployment `session-store` in Namespace `sagitta` runs 3 replicas of
`nginx:1.27-alpine`. Its ConfigMap `session-store-conf` has been edited,
and the containers only read it at start-up, so every Pod is serving a
stale value.

Replace all three Pods, so that:

1. Every Pod currently backing `session-store` was created **after** the
   replacement, and none of the original three is left.
2. The replacement happens as a Deployment rollout that the Pod template
   records, not by deleting Pods and letting the ReplicaSet make new
   ones.
3. **Nothing about what the Deployment runs changes.** The image, the
   replica count, the container name and the container's configuration
   must all be exactly what they are now.

Wait until the rollout finishes and all 3 replicas are ready again.
