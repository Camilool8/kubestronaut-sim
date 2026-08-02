Namespace `corvus` has three workloads. One is healthy; two are not, and
they are broken in different ways.

1. One Pod is restarting over and over. Write **its name** to
   `/opt/course/17/crashing-pod` on `instance-1` — the name only,
   nothing else.
2. Save the log output from that container's **previous, already-dead**
   run to `/opt/course/17/crash.log`. The message explaining the failure
   must be in that file.
3. One Deployment can never start because its image cannot be pulled.
   Write the **full image reference** it is asking for to
   `/opt/course/17/bad-image` on `instance-1`, then correct that
   Deployment to use `nginx:1.29-alpine` so it becomes ready.

Do not touch the healthy workload.
