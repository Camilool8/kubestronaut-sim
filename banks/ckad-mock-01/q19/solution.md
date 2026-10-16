# Solution 19

Confirm the symptom before touching anything. No endpoints means the
Service is not selecting any Pods:

```bash
k -n serpens get endpointslice -l kubernetes.io/service-name=inventory
# NAME              ENDPOINTS   PORTS
# inventory-abc12   <unset>     <unset>
```

Now compare what the Service is looking for against what the Pods have:

```bash
k -n serpens get svc inventory -o jsonpath='{.spec.selector}'
# {"app":"inventory-api"}

k -n serpens get pod --show-labels
# ... app=inventory,pod-template-hash=...
```

`inventory-api` versus `inventory`. That is fault one.

Fault two is on the port. Look at what the container actually opens:

```bash
k -n serpens get deploy inventory \
  -o jsonpath='{.spec.template.spec.containers[0].ports[0].containerPort}'
# 8080
```

The Service targets `80`. Fix both:

```bash
k -n serpens edit svc inventory
```

```yaml
spec:
  selector:
    app: inventory      # was inventory-api
  ports:
    - port: 80
      targetPort: 8080  # was 80
```

Endpoints appear as soon as the selector matches:

```bash
k -n serpens get endpointslice -l kubernetes.io/service-name=inventory
# NAME              ENDPOINTS               PORTS
# inventory-abc12   10.244.1.7,10.244.2.4   8080
```

Then prove it end to end and save the answer:

```bash
k -n serpens run probe --rm -it --restart=Never --image=nginx:1.29-alpine -- \
  curl -s http://inventory.serpens.svc:80/
# inventory

k -n serpens run svc-check --restart=Never --image=nginx:1.29-alpine -- \
  curl -s http://inventory.serpens.svc:80/
k -n serpens wait --for=jsonpath='{.status.phase}'=Succeeded pod/svc-check
k -n serpens logs svc-check > /opt/course/19/service-check
k -n serpens delete pod svc-check
cat /opt/course/19/service-check
# inventory
```

Save it from the Pod's log, not from an attached `kubectl run --rm -i`.
Redirecting an attached run also captures kubectl's own `pod "…" deleted`
line, and whether the container's output arrives once, twice or not at all
depends on how the attach races a container that exits in milliseconds —
kubectl 1.37 usually prints it twice. `kubectl logs` returns exactly what the
container wrote, once.

## Why two faults

Because they fail differently, and fixing one is not obviously progress:

- **Wrong selector** → *no endpoints at all*. Connections are refused
  immediately: there is nothing for kube-proxy to forward to.
- **Wrong targetPort** → *endpoints exist, listed on the wrong port*.
  Connections hang and then time out, because traffic is being sent to a
  port nothing is listening on.

Repair only the selector and the endpoints list fills in, which looks
like success — and the Service still answers nothing. That gap between
"has endpoints" and "actually responds" is why the check does both.

## port vs targetPort vs containerPort

| Field | Belongs to | Means |
|---|---|---|
| `port` | Service | What clients connect to |
| `targetPort` | Service | The port on the Pod to forward to |
| `containerPort` | Pod | Documentation; it opens nothing |

`targetPort` may also name a port rather than number it, which survives
the container's port changing:

```yaml
    ports:
      - name: http
        containerPort: 8080   # in the Pod
---
    ports:
      - port: 80
        targetPort: http      # in the Service
```

`containerPort` being purely informational is worth internalising: a
container listening on 8080 is reachable whether or not the Pod spec
mentions 8080 at all.
