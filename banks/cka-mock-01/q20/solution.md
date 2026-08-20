# Solution 20

**1. The CPU request.** Do this first — it is the part that is easy to
forget and impossible to see going wrong.

```bash
k -n sagitta set resources deploy payments-api \
  --containers=api --requests=cpu=100m
```

`set resources` merges key by key, so the memory request and limit the
container already had are untouched. Confirm that before moving on:

```bash
k -n sagitta get deploy payments-api -o json \
  | jq '.spec.template.spec.containers[] | select(.name == "api") | .resources'
```

```json
{
  "limits": {
    "memory": "128Mi"
  },
  "requests": {
    "cpu": "100m",
    "memory": "64Mi"
  }
}
```

Read that back with `-o jsonpath` and you get Go's own map formatting
rather than JSON, because jsonpath prints whatever it lands on and this
lands on a map. It is fine for a single scalar and misleading for
anything else — reach for `-o json | jq` when the field has structure.

Editing the Deployment by hand does the same job. What does not work is
chasing the Pods: the ordinary update path will not accept a resource
change on a running Pod, and even where a cluster permits one the Pod is
owned by a ReplicaSet, so the change is gone the moment it is replaced.
Resources live in the template, and changing the template is what rolls a
new ReplicaSet.

**2. The autoscaler.** The generator gets you three of the four settings.
Send it to a file rather than to the cluster, because the fourth has to
be added by hand:

```bash
k -n sagitta autoscale deploy payments-api --min=2 --max=6 --cpu=50% \
  --dry-run=client -o yaml > hpa.yaml
```

Two things about that command are worth knowing before you reach for it
under a clock. The first is the flag: `--cpu-percent` is deprecated, and
`--cpu` replaced it by taking either form and choosing the target type
from which one you gave it.

| `--cpu` value | What lands in the manifest |
|---|---|
| `50%` | `type: Utilization`, `averageUtilization: 50` |
| `500m` | `type: AverageValue`, `averageValue: 500m` |

There is a matching `--memory` that works the same way. The second is the
API version, and the command's own help states it:

> The command will attempt to use the autoscaling/v2 API first, in case
> of an error, it will fall back to autoscaling/v1 API.

So on a cluster serving v2 — this one does — what comes back is already
an `autoscaling/v2` object with the `scaleTargetRef`, the range and the
CPU metric correct. What no flag will give you is `behavior`; read the
options list and there is nothing there to write one. Add it to the file
and apply:

```bash
k apply -f - <<'EOF'
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: payments-api
  namespace: sagitta
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: payments-api
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 60
EOF
```

Typing the whole manifest out is the slower road. Generating it and
appending four lines is the same answer in a fraction of the time, and
`kubectl explain hpa.spec.behavior --recursive` will remind you of the
field names without a trip to the documentation.

## v1 and v2 are the same object

There is one HPA in etcd and two ways to ask for it, so this is not a
migration — it is a choice of window. A v1 object read as v2 grows the
`metrics` list from its single `targetCPUUtilizationPercentage`, and a v2
object read as v1 loses everything v1 cannot express. That includes
`behavior`, which v1 never had: an autoscaler read through the older
version simply appears not to have one.

Which is why it is worth asking for a version by name when the answer
matters:

```bash
k -n sagitta get hpa.v2.autoscaling payments-api \
  -o jsonpath='{.spec.behavior.scaleDown.stabilizationWindowSeconds}{"\n"}'
```

`resource.version.group` works on any `kubectl get` — `deploy.v1.apps`,
`hpa.v2.autoscaling` — and it is the quickest way to settle an argument
about whether a field is missing or merely invisible from where you are
looking.

## The API server writes more than you did

Read the object back and there is a `scaleUp` block you never typed:

```bash
k -n sagitta get hpa.v2.autoscaling payments-api -o json | jq .spec.behavior
```

```json
{
  "scaleDown": {
    "policies": [{"periodSeconds": 15, "type": "Percent", "value": 100}],
    "selectPolicy": "Max",
    "stabilizationWindowSeconds": 60
  },
  "scaleUp": {
    "policies": [
      {"periodSeconds": 15, "type": "Pods", "value": 4},
      {"periodSeconds": 15, "type": "Percent", "value": 100}
    ],
    "selectPolicy": "Max",
    "stabilizationWindowSeconds": 0
  }
}
```

Defaulting fills in every rule under `behavior` that was left out, and it
only runs at all once `behavior` is present: an HPA without the block
keeps `spec.behavior` empty and the controller applies the same defaults
at runtime instead. So an object that looks over-specified is not a
mistake, and `diff`-ing your manifest against what comes back will always
show a difference. Read the field you set.

The default that matters most is the one you replaced:
`scaleDown.stabilizationWindowSeconds` is **300** unless something says
otherwise, against **0** for `scaleUp`. Kubernetes scales out
immediately and retreats slowly on purpose — a brief dip in load that
triggered an instant scale-down would cost you the capacity you need
thirty seconds later. The window makes the controller scale down only to
the highest replica count it recommended anywhere inside it.

## Why the request is not optional

`type: Utilization` means a percentage of the sum of the Pod's container
CPU **requests**. No request, no denominator, and the calculation cannot
be done at all:

```
utilization = current usage / requested CPU
```

An HPA whose target has no CPU request is accepted without complaint,
reports `<unknown>` for that metric forever, and never scales on it. That
silence is the trap: nothing is broken in a way that shows up in
`describe` on the Deployment, and the autoscaler looks fine until you
notice the replica count has never moved.

The other target type sidesteps the request entirely:

| Target type | Field | Means |
|---|---|---|
| `Utilization` | `averageUtilization: 50` | 50 % of the container's CPU request |
| `AverageValue` | `averageValue: 500m` | 500 millicores per Pod, requests irrelevant |

And a fact worth carrying into the exam: if a container has a CPU
**limit** and no CPU request, Kubernetes copies the limit into the
request. A Deployment with limits and no requests therefore autoscales
fine, while one with neither does not — which is a difference that looks
like nothing at all in a manifest review.

## What this cluster will show you

There is no metrics-server here, so there is no `metrics.k8s.io` API:

```bash
k top pod -n sagitta
```

```
error: Metrics API not available
```

The autoscaler reports that as an unknown target and says so in its
conditions:

```bash
k -n sagitta get hpa
```

```
NAME           REFERENCE                 TARGETS              MINPODS   MAXPODS   REPLICAS   AGE
payments-api   Deployment/payments-api   cpu: <unknown>/50%   2         6         3          1m
```

`kubectl -n sagitta describe hpa payments-api` says the same thing in its
conditions, and those two rows are the ones to read:

```
Conditions:
  Type            Status   Reason
  AbleToScale     True     SucceededGetScale
  ScalingActive   False    FailedGetResourceMetric
```

`AbleToScale` is about reaching the scale subresource; `ScalingActive` is
about having a usable metric. Seeing the first True and the second False
is exactly what a missing metrics API looks like — and, on a cluster that
has one, exactly what a missing CPU request looks like too. Distinguishing
the two is a matter of asking whether `kubectl top` works for anything at
all.

One thing does still work without any metric: the range. The controller
clamps the replica count into `minReplicas`..`maxReplicas` before it asks
for a measurement, so an HPA with `minReplicas: 2` over a Deployment
sitting at 1 will take it to 2 on a cluster like this one. This
Deployment starts at 3, inside the range, so nothing moves.

On a cluster with metrics-server the rest follows: the controller reads
each Pod's CPU against its request every 15 seconds, averages, and
compares to 50 %. `kubectl get hpa -w` is the view worth watching, and
`describe` names the reason for every scaling decision it made.
