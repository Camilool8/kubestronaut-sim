# Solution 1

## Read the symptom first

```bash
k -n orion get pod
# NAME                             READY   STATUS             RESTARTS   AGE
# telemetry-api-6c9f8d7c4b-2xk4n   0/1     ImagePullBackOff   0          6m
# telemetry-api-6c9f8d7c4b-8vqzt   0/1     ImagePullBackOff   0          6m
# telemetry-api-6c9f8d7c4b-jr7pd   0/1     ImagePullBackOff   0          6m
```

`ImagePullBackOff` is the kubelet telling you it asked a registry for a
tag and was told no. `describe` names the tag it asked for:

```bash
k -n orion describe pod -l app=telemetry-api | grep -A2 Events
# Failed to pull image "nginx:1.99": ... not found
```

## Fault one: the image

```bash
k -n orion set image deploy/telemetry-api api=nginx:1.29-alpine
```

`set image` names the container (`api=`) rather than guessing, which is
what you want on a Pod template that could have more than one.

Watch what happens next, because this is the part worth learning:

```bash
k -n orion get pod
# NAME                             READY   STATUS    RESTARTS   AGE
# telemetry-api-7d4b9f6c58-lr2wd   0/1     Running   0          40s
```

`Running` and `0/1`. The container started, so the image was the whole of
fault one — and the Deployment is still not available. Nothing crashed and
nothing restarted.

## Fault two: the probe

`0/1` on a container that is running and not restarting means readiness,
so compare the probe against the port the container opens:

```bash
k -n orion get deploy telemetry-api -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].ports}'
# [{"containerPort":8080,"name":"http","protocol":"TCP"}]

k -n orion get deploy telemetry-api -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].readinessProbe}'
# {"failureThreshold":3,"httpGet":{"path":"/","port":80,"scheme":"HTTP"},...}
```

The container serves 8080 and the probe knocks on 80. Fix it:

```bash
k -n orion edit deploy telemetry-api
```

```yaml
          readinessProbe:
            httpGet:
              path: /
              port: 8080     # was 80
```

That port may also be written as the name the container gave it, which is
`http` here — a probe by name keeps working if the number ever moves:

```yaml
            httpGet:
              path: /
              port: http
```

Either form is accepted.

## Confirm

```bash
k -n orion rollout status deploy/telemetry-api
# deployment "telemetry-api" successfully rolled out

k -n orion get deploy telemetry-api
# NAME            READY   UP-TO-DATE   AVAILABLE   AGE
# telemetry-api   3/3     3            3           9m
```

If you want to see the application itself, ask it from inside the cluster
— an instance is not a cluster node, so a ClusterIP means nothing there:

```bash
k -n orion exec deploy/telemetry-api -- wget -qO- http://127.0.0.1:8080/
# telemetry
```

## Why the two faults had to be fixed in that order

They stack, and only one of them is visible at a time:

| Fault | Pod STATUS | What it tells you |
|---|---|---|
| Unpullable tag | `ImagePullBackOff`, `0/1` | The container never started, so no probe has ever run |
| Probe on the wrong port | `Running`, `0/1`, 0 restarts | The container is up and healthy and says it is not ready |

A readinessProbe never restarts anything — that is a livenessProbe's job.
It only decides whether the Pod counts as ready, which in turn decides
whether it is in a Service's endpoint list and whether the Deployment can
report `Available`. So a probe aimed at a closed port produces the quietest
possible failure: no crash, no restart count climbing, no error in
`kubectl logs`, just a rollout that never finishes.

Deleting the probe would also have turned the Pods green, and it is the
wrong answer for the same reason: with no readiness gate at all, a Pod
joins its Service's endpoints the instant the container process starts,
including the seconds before the application can serve anything.

## `containerPort` is documentation

Worth knowing, because it is a common misreading: `ports.containerPort`
opens nothing. The container listens because nginx was configured to
listen — declaring the port in the Pod spec only records the fact, and
gives it a name that a probe or a Service `targetPort` can refer to. A
container serving 8080 is reachable on 8080 whether or not the Pod spec
mentions it.
