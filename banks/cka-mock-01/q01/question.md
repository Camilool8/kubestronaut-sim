Deployment `telemetry-api` in Namespace `orion` asks for 3 replicas and has
never had a single ready one. It is broken in **two** independent ways, and
the second only becomes visible once the first is fixed.

What is correct and must stay that way: the container is named `api`, it
serves plain HTTP on port **8080**, and the ConfigMap `telemetry-conf` that
tells it to listen there is right. Do not change the ConfigMap, the
container's port, or the replica count.

1. The container's image should be `nginx:1.29-alpine`. Correct it.
2. Repair the container's `readinessProbe` so it probes the port the
   container actually serves on. **Keep the probe** — it must remain an
   HTTP GET on path `/`. Deleting it, or replacing it with a probe of
   another type, is not the fix.
3. Finish with all **3** replicas Ready and the Deployment reporting
   `Available`.

The two failures read differently, which is how you tell them apart:

```bash
k -n orion get pod
k -n orion describe deploy telemetry-api
```
