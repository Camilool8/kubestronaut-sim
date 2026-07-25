# Question 2 | Node-targeted scheduling

*Solve this question on instance: `ssh instance-2`*

A storage-heavy workload must only run on nodes with fast disks.

1. Label the node `sim-worker` with `disk=ssd`.
2. In the `cka-sched` Namespace (already created), create a Pod named
   `fast-store` using image `nginx:1.29-alpine` that is scheduled **only**
   onto nodes carrying the `disk=ssd` label (use a nodeSelector — do not
   name the node directly).
3. Once the Pod is running, save the name of the node it landed on to
   `/opt/course/2/node` on `instance-2`.
