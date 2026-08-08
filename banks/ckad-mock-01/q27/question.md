Namespace `fornax` accepts manifests from several teams and most of them
declare no resources at all. Those Pods are best-effort: the scheduler
reserves nothing for them and the kubelet evicts them first.

1. Create a LimitRange named `container-defaults` in Namespace `fornax`
   that gives every **container** which declares none:
   - a request of `100m` CPU and `128Mi` memory,
   - a limit of `500m` CPU and `256Mi` memory.
2. Create a Pod named `unspecified` in `fornax` with a single container
   named `app`, image `nginx:1.29-alpine`, and **no `resources` block at
   all**. It must reach `Running`.
3. Save the CPU request that Pod actually ended up with — the quantity on
   its own, nothing else — to `/opt/course/27/cpu-request` on
   `instance-1`.
