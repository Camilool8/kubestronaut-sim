`/opt/course/18/legacy.yaml` on `instance-2` holds two resources written
against Kubernetes API versions that no longer exist. Applying it fails.

1. Write a corrected copy to `/opt/course/18/fixed.yaml`, leaving the
   original alone. Keep the resources doing exactly what they did — the
   same names, schedule, image, command, host and backend — and change
   only what the current API requires. The Ingress needs `pathType`
   `Prefix` and IngressClass `nginx`.
2. Apply `fixed.yaml` to Namespace `lynx`. Both resources must exist
   there afterwards.
3. Ask the cluster which API version it serves for `CronJob` and save
   just that version string (for example `something/v9`) to
   `/opt/course/18/cronjob-version` on `instance-2`.

`kubectl explain` and `kubectl api-resources` both know the answer to
task 3 without an internet connection.
