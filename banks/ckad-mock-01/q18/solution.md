# Solution 18

Confirm the diagnosis first — the error names both problems:

```bash
k -n lynx apply -f /opt/course/18/legacy.yaml --dry-run=server
# error: resource mapping not found for ... "nightly-report": no matches
#        for kind "CronJob" in version "batch/v1beta1"
```

`--dry-run=server` is the right tool here: it asks the API server, so it
fails on exactly what a real apply would fail on, without creating
anything.

Ask the cluster what it does serve:

```bash
k api-resources --api-group=batch
# NAME       APIVERSION   NAMESPACED   KIND
# cronjobs   batch/v1     true         CronJob
# jobs       batch/v1     true         Job

k explain ingress --api-version=networking.k8s.io/v1
```

**1. Write the corrected copy:**

```bash
cp /opt/course/18/legacy.yaml /opt/course/18/fixed.yaml
vim /opt/course/18/fixed.yaml
```

```yaml
apiVersion: batch/v1              # was batch/v1beta1
kind: CronJob
metadata:
  name: nightly-report
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: report
              image: busybox:1.37
              command: ["sh", "-c", "echo generating nightly report"]
---
apiVersion: networking.k8s.io/v1  # was networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: reports
spec:
  ingressClassName: nginx         # new: class is a field, not an annotation
  rules:
    - host: reports.sim.local
      http:
        paths:
          - path: /
            pathType: Prefix      # new: now mandatory
            backend:
              service:            # was serviceName / servicePort
                name: reports
                port:
                  number: 80
```

**2. Apply and check:**

```bash
k -n lynx apply -f /opt/course/18/fixed.yaml
k -n lynx get cronjob,ingress
```

**3. Record the version:**

```bash
echo batch/v1 > /opt/course/18/cronjob-version
```

## The CronJob was a rename; the Ingress was a migration

`batch/v1beta1` → `batch/v1` is a pure version bump: the CronJob schema
did not change, so only the first line moves.

The Ingress is the real work. Three things changed between v1beta1 and
v1:

- `backend.serviceName` / `backend.servicePort` became a nested
  `backend.service` object with `name` and `port.number` (or
  `port.name`).
- `pathType` became **required**. There is no default; omit it and the
  object is rejected.
- The controller is selected by the `ingressClassName` field instead of
  the `kubernetes.io/ingress.class` annotation, which is deprecated.

That is the general shape of these removals: a beta API is not just
renamed, it is usually reshaped. Reading the removal notes matters more
than editing the version line.

## Finding this before it bites

Deprecated APIs are removed on a published schedule, and a cluster warns
you on the way:

```bash
k -n lynx apply -f /opt/course/18/legacy.yaml
# Warning: batch/v1beta1 CronJob is deprecated in v1.21+, unavailable in v1.25+
```

Warnings, not errors — until the release that removes them, at which
point manifests that have worked for years stop applying. `kubectl
api-resources` is the authoritative answer for the cluster in front of
you; `kubectl convert` (a plugin, not built in) can do the mechanical
part of the rewrite.
