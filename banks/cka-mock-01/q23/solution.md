# Solution 23

## What the cluster gives you to start with

```bash
k get sc
# NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      AGE
# standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer   41m

k get pv
# No resources found

k -n mensa get pvc,pod
# No resources found in mensa namespace.
```

One class exists and it is the wrong tool for this job: it provisions a
fresh empty directory on demand. The report is already on disk, on one
named node, and the task is to publish *that* — which is what a
statically created `local` PersistentVolume is for, and why its class
must provision nothing.

## The StorageClass

```bash
k apply -f - <<'EOF'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: q23-local
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
EOF
# storageclass.storage.k8s.io/q23-local created
```

`kubernetes.io/no-provisioner` is the reserved value meaning *no
controller serves this class*. Volumes on it are the ones an
administrator created by hand — the class exists only as the name the
volume and the claim both quote so they can find each other.

Both fields are immutable. Getting one wrong is `k delete sc q23-local`
and apply again, not `edit`.

## The PersistentVolume

There is no generator for this one. Copy the example from the
documentation and edit it:

```bash
k apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolume
metadata:
  name: q23-report-pv
spec:
  capacity:
    storage: 1Gi
  accessModes: [ReadWriteOnce]
  storageClassName: q23-local
  local:
    path: /mnt/q23-data
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values: [sim-worker]
EOF
# persistentvolume/q23-report-pv created
```

`spec.local.path` is a path on the node, never on the machine you are
typing on. `spec.nodeAffinity` is what a `local` volume has instead of a
node name, and the API server rejects the object without it:

```
The PersistentVolume "q23-report-pv" is invalid: spec.nodeAffinity: Required
value: Local volume requires node affinity
```

Note the two spellings that look interchangeable and are not. Under a
Pod, node affinity is
`affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution`;
under a PersistentVolume it is the shorter `nodeAffinity.required`. And
the node's name is the one the API answers to — `k get nodes` prints
`sim-worker`, while `cka-worker1` is an ssh alias in a client config file
that the API server has never heard of.

```bash
k get pv
# NAME            CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS      CLAIM   STORAGECLASS   AGE
# q23-report-pv   1Gi        RWO            Retain           Available           q23-local      5s
```

`Available` and no claim: the volume is offered but nothing has asked for
it. `Retain` is the default reclaim policy for a volume created by hand,
which is right here — the report is not this cluster's to delete.

## The claim

```bash
k -n mensa apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: report-data
  namespace: mensa
spec:
  storageClassName: q23-local
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
EOF
# persistentvolumeclaim/report-data created

k -n mensa get pvc
# NAME          STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# report-data   Pending                                      q23-local      3s
```

`Pending`, and correct. Read the events before believing anything is
broken:

```bash
k -n mensa describe pvc report-data | tail -3
# Events:
#   Type    Reason                Age   From                         Message
#   Normal  WaitForFirstConsumer  2s    persistentvolume-controller  waiting for first consumer to be created before binding
```

The controller is saying it will bind when it knows where the consumer is
going. Naming the class matters as much as the mode: leave
`storageClassName` out and the claim falls to the default class, which
provisions a brand-new empty directory, reports `Bound` within seconds
and never touches the report.

## The Pod, which is what binds it

```bash
k -n mensa apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: report-reader
  namespace: mensa
spec:
  containers:
    - name: reader
      image: nginx:1.29-alpine
      volumeMounts:
        - name: report
          mountPath: /data
  volumes:
    - name: report
      persistentVolumeClaim:
        claimName: report-data
EOF
# pod/report-reader created
```

The name `report` appears twice and the claim's name appears once. The
`volumes` entry is what attaches the claim to the Pod; the
`volumeMounts` entry names **that volume**, not the claim, and says where
in the container it lands.

```bash
k -n mensa get pvc,pod -o wide
# NAME                                STATUS   VOLUME          CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# persistentvolumeclaim/report-data   Bound    q23-report-pv   1Gi        RWO            q23-local      38s

# NAME                READY   STATUS    RESTARTS   AGE   IP           NODE
# pod/report-reader   1/1     Running   0          9s    10.244.1.7   sim-worker

k -n mensa exec report-reader -- cat /data/report.txt
# nightly report - staged on sim-worker
# records: 4211
# token: q23-9f3c1a
```

The claim flipped to `Bound` the moment the scheduler picked a node for
`report-reader`, and the node it picked was `sim-worker` because that is
the only node the volume's affinity allows. Nothing else moved it there:
the Pod names no node.

## Why the mode is the whole question

`WaitForFirstConsumer` defers binding until a Pod that uses the claim is
being scheduled, which reverses the order of two decisions:

| Binding mode | Order | Result for a volume that lives on one node |
|---|---|---|
| `Immediate` | Bind the claim, then schedule the Pod | The volume is chosen blind. The Pod is then forced onto whichever node it turned out to be on, or — if that node cannot take the Pod — left `Pending` with no way back |
| `WaitForFirstConsumer` | Schedule the Pod, then bind | The volume's node affinity is one of the inputs to the scheduling decision, so the Pod and the volume are chosen together |

With a single volume on a single node the difference is easy to miss.
With a dozen local volumes across four nodes it is the difference between
a workload that schedules and one that deadlocks, and it is why the mode
exists.

The visible cost is that a claim on such a class looks broken while it is
merely waiting. `Pending` with a `WaitForFirstConsumer` event is not a
fault to repair — switching the class to `Immediate` to make the word
`Bound` appear throws away the guarantee and, because the field is
immutable, means deleting and recreating everything downstream.

## The ways this half-works

| What you wrote | What happens |
|---|---|
| `spec.hostPath` instead of `spec.local` on the volume | Accepted, and it binds — but a hostPath volume has no node affinity, so the scheduler is free to place the Pod anywhere. On any node but `sim-worker` the container gets an empty directory (or one the kubelet just created) and the report is not there |
| `preferredDuringScheduling…` in place of `required` | Rejected outright: a PersistentVolume takes `nodeAffinity.required` and nothing else. Written under a Pod instead, it is a hint the scheduler may ignore, which for a local volume means a Pod that starts on the wrong node and fails to mount |
| No `storageClassName` on the claim | The default class provisions a new empty directory. `Bound` in seconds, `/data` empty, `q23-report-pv` still `Available` |
| A claim asking for `2Gi`, or `ReadWriteMany` | Never matched. A volume must offer at least the requested capacity and every requested access mode. The claim stays `Pending` with no event beyond the wait-for-consumer one — the mismatch is silent |
| `volumeMounts[].name: report-data` | The mount names a volume that does not exist in the Pod, and the API server rejects the Pod. The claim's name belongs in `volumes[].persistentVolumeClaim.claimName` only |
