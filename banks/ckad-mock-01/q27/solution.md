# Solution 27

**1. The LimitRange first.** This is not a stylistic preference: a Pod is
only ever touched by the LimitRanges that already exist at the moment it
is admitted.

```bash
k apply -f - <<'EOF'
apiVersion: v1
kind: LimitRange
metadata:
  name: container-defaults
  namespace: fornax
spec:
  limits:
    - type: Container
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      default:
        cpu: 500m
        memory: 256Mi
EOF
```

**2. A Pod that asks for nothing.** There is no `resources` key anywhere
in this manifest, which is the whole point of the exercise:

```bash
k apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: unspecified
  namespace: fornax
spec:
  containers:
    - name: app
      image: nginx:1.29-alpine
EOF
k -n fornax get pod unspecified
```

**3. Read back what the Pod was actually given.** Ask the Pod, not the
LimitRange — the object you wrote and the object the API server stored
are not the same document any more:

```bash
k -n fornax get pod unspecified -o jsonpath='{.spec.containers[0].resources}'
```

```json
{"limits":{"cpu":"500m","memory":"256Mi"},"requests":{"cpu":"100m","memory":"128Mi"}}
```

```bash
k -n fornax get pod unspecified \
  -o jsonpath='{.spec.containers[0].resources.requests.cpu}' \
  > /opt/course/27/cpu-request
cat /opt/course/27/cpu-request      # 100m
```

`describe` shows the same thing with a receipt attached:

```bash
k -n fornax describe pod unspecified | head -12
# Annotations: kubernetes.io/limit-ranger:
#   LimitRanger plugin set: cpu, memory request for container app; ...
```

## Where this happens

`LimitRanger` is an admission plugin inside the API server. It runs
between authorisation and persistence, on the way in, and it rewrites the
object being created. Nothing reconciles afterwards, which has two
consequences worth carrying:

- **Pods created before the LimitRange keep their emptiness.** Creating
  the LimitRange second changes nothing about anything already running,
  and there is no controller that will come back for them. Delete and
  recreate the Pod if you get the order wrong.
- **The stored Pod is the mutated one.** `kubectl get -o yaml` shows
  requests and limits that appear in no file you wrote, and the
  `kubernetes.io/limit-ranger` annotation names which plugin put them
  there.

## default is the limit, defaultRequest is the request

The naming is the trap. `default` is the *limit* a container gets when it
names none; `defaultRequest` is the request. Write only `default` and the
request quietly becomes equal to the limit, so a container that asked for
nothing reserves the full ceiling — half a CPU each, here, against a
scheduler that then packs the node far more thinly than anyone intended.

## A LimitRange is not a ResourceQuota

They are separate objects doing separate jobs, and they are often
confused because both live in a Namespace and both talk about CPU and
memory:

| | LimitRange | ResourceQuota |
|---|---|---|
| Applies to | one container or one Pod | the Namespace as a whole |
| Enforced | at admission, per object | against the running total |
| Can fill in missing values | yes | no |
| Failure mode | the object is rejected, or defaulted | the object is rejected once the total is reached |

They also work together, and this is the usual reason to reach for both:
a ResourceQuota that constrains `requests.cpu` **rejects any Pod that
does not declare one**. Adding a LimitRange with `defaultRequest` is what
lets teams keep submitting bare manifests into a quota-ed Namespace at
all.

The other two maps on the same entry, which this question deliberately
does not use, are `max` and `min` — hard ceilings and floors that reject
an object outright rather than filling anything in.
