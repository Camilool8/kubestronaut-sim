Deployment `nova-api` in Namespace `nova` is failing to roll out.

1. Before changing anything, save the currently configured (broken) container
   image name to `/opt/course/2/old-image` on `instance-1`.
2. Fix the Deployment: the image should be `nginx:1.29-alpine`.
3. Scale it to **3 replicas** and wait until all are ready.
4. Add a readinessProbe: HTTP GET `/` on port `80`, `initialDelaySeconds: 5`,
   `periodSeconds: 10`.
5. Configure the rollout strategy so updates never reduce available replicas:
   `maxSurge: 1`, `maxUnavailable: 0`.
