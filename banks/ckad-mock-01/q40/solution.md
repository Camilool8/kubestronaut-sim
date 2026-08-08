# Solution 40

Three things separate a StatefulSet from a Deployment, and this question
uses all of them: Pod names that end in a stable ordinal, a governing
Service named by `serviceName`, and `volumeClaimTemplates` — the field
that hands every replica a PersistentVolumeClaim of its own instead of
pointing them all at one.

```bash
k apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: ledger
  namespace: cepheus
spec:
  clusterIP: None
  selector:
    app: ledger
  ports:
    - port: 80
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ledger
  namespace: cepheus
spec:
  serviceName: ledger
  replicas: 2
  selector:
    matchLabels: {app: ledger}
  template:
    metadata:
      labels: {app: ledger}
    spec:
      containers:
        - name: ledger
          image: busybox:1.37
          command: ["sh", "-c", "sleep 86400"]
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        resources:
          requests:
            storage: 128Mi
EOF
```

Note where `volumeClaimTemplates` sits: at the same level as
`replicas` and `template`, not inside the Pod spec. Putting it one
level too deep is the usual first attempt, and the API server rejects it
rather than quietly ignoring it, which is the good outcome.

Watch it come up. Replicas are created in order, so `ledger-1` does not
start until `ledger-0` is Ready:

```bash
k -n cepheus rollout status statefulset ledger
k -n cepheus get pod,pvc
# NAME           READY   STATUS
# pod/ledger-0   1/1     Running
# pod/ledger-1   1/1     Running
#
# NAME                                     STATUS   VOLUME     CAPACITY
# persistentvolumeclaim/data-ledger-0      Bound    pvc-…      128Mi
# persistentvolumeclaim/data-ledger-1      Bound    pvc-…      128Mi
```

Then write each Pod's own name into its own volume and record the claim
names:

```bash
for p in ledger-0 ledger-1; do
  k -n cepheus exec "$p" -- sh -c "echo $p > /data/owner"
done

k -n cepheus get pvc -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
  > /opt/course/40/claims
cat /opt/course/40/claims
# data-ledger-0
# data-ledger-1
```

## Where the claim names come from

`<template name>-<statefulset name>-<ordinal>`. The controller derives
them, which is why they are worth reading rather than inventing: they
are how a replacement Pod finds the volume its predecessor was using.
Delete `ledger-0` and the StatefulSet recreates a Pod with the same
name, which claims `data-ledger-0` again and sees `/data/owner` exactly
as it left it. That is the "storage that survives" part.

Deleting the StatefulSet does **not** delete the claims. They outlive it
on purpose, and cleaning them up is a separate, deliberate step.

## Why no storage class

The cluster has a default StorageClass with a dynamic provisioner, so a
claim that names no class gets the default injected and a volume created
for it on demand. That is what makes `volumeClaimTemplates` practical:
two replicas today, ten tomorrow, and nobody creates ten
PersistentVolumes by hand.

Naming a class only matters when you want a *particular* one — or when
you want to opt out of dynamic provisioning entirely and bind to a
volume you made yourself, which needs a class name no provisioner
answers for.

## What a Deployment would have done instead

A Deployment has no `volumeClaimTemplates`. To give its Pods persistent
storage you write one PersistentVolumeClaim and reference it from the
Pod template, so **every replica mounts the same volume** — fine for
something read-only or genuinely shared, and wrong the moment each
replica owns state. With a `ReadWriteOnce` claim it is worse than wrong:
the second replica cannot mount at all if it lands on another node, and
the rollout stalls with no obvious cause.
