# Solution 3

Read the symptom first. The endpoint list is where a Service says which
Pods it found and where it will forward to:

```bash
k -n draco get endpointslice -l kubernetes.io/service-name=nova-api
# NAME             ADDRESSTYPE   PORTS     ENDPOINTS
# nova-api-abc12   IPv4          <unset>   <unset>
```

No addresses, so nothing is being selected. Compare what the Service
asks for against what the Pods carry:

```bash
k -n draco get svc nova-api -o jsonpath='{.spec.selector}'
# {"app":"nova-api-prod"}

k -n draco get pod --show-labels
# ... app=nova-api,pod-template-hash=...
```

`nova-api-prod` against `nova-api`. That is fault one.

Fault two is on the port, and it is a typo rather than a wrong number:

```bash
k -n draco get svc nova-api -o jsonpath='{.spec.ports[*].targetPort}'
# http-aip

k -n draco get deploy nova-api \
  -o jsonpath='{.spec.template.spec.containers[*].ports[*].name}'
# http-api
```

`http-aip` against `http-api`. Fix both, leaving `port: 80` alone —
that is the address clients were told to use, and it was never wrong:

```bash
k -n draco edit svc nova-api
```

```yaml
spec:
  selector:
    app: nova-api        # was nova-api-prod
  ports:
    - port: 80
      targetPort: http-api   # was http-aip
```

The list fills in as soon as the selector matches, and this time it
carries a port:

```bash
k -n draco get endpointslice -l kubernetes.io/service-name=nova-api
# NAME             ADDRESSTYPE   PORTS   ENDPOINTS
# nova-api-abc12   IPv4          8080    10.244.1.7,10.244.2.4
```

Prove it end to end from inside the cluster, using a Pod the question
already runs rather than one you have to schedule:

```bash
k -n draco exec deploy/nova-api -- curl -s http://nova-api.draco.svc:80/
# nova-api
```

Then record the ready count. Take it from the Service's own endpoint
list rather than from the replica count, which is the same number for a
different reason:

```bash
k -n draco get endpointslice -l kubernetes.io/service-name=nova-api -o json \
  | jq '[.items[].endpoints[] | select(.conditions.ready == true)] | length'
# 2

echo 2 > /opt/course/3/endpoints
```

## Why the two faults look the same and are not

Both leave a Service that answers nothing, and both get described as
"no endpoints" — but they fail at different steps, and knowing which
step is which is what makes the second one findable:

- **The selector decides which Pods are found.** While `spec.selector`
  matches nothing, the endpoint controllers have no Pod to write down,
  so the list has no addresses and a connection is refused outright.
- **The `targetPort` decides where a found Pod is contacted.** It is
  resolved per Pod against the names in that Pod's
  `containers[].ports`, and a name no container answers to resolves to
  no port at all — so even a Pod the selector did find gives kube-proxy
  nothing usable to forward to.

Repairing only the selector therefore looks like progress and is not:
the Service is now finding its Pods and still answers nothing. Watch
the `PORTS` column of the EndpointSlice as well as the `ENDPOINTS` one
— until both are populated, the Service cannot serve a request.

## port, targetPort and containerPort

| Field | Belongs to | Means |
|---|---|---|
| `port` | Service | What clients connect to |
| `targetPort` | Service | The port on the Pod to forward to |
| `containerPort` | Pod | Documentation; it opens nothing |

Naming the port is worth the extra field. A numeric `targetPort` has to
be changed in two objects when the application moves to another port; a
named one follows the container, and the Service never needs editing:

```yaml
    ports:
      - name: http-api
        containerPort: 8080   # in the Pod
---
    ports:
      - port: 80
        targetPort: http-api  # in the Service
```

The trade is the one this question is built on: a number that is wrong
is wrong loudly, while a name that is wrong is a typo the API server
accepts without complaint. Nothing validates that a named `targetPort`
resolves anywhere — the name is only looked up when endpoints are
written, and there is no error to find afterwards, only an empty
`PORTS` column.

`containerPort` being purely informational is worth internalising
alongside it: a container listening on 8080 is reachable whether or not
the Pod spec mentions 8080 at all. What the name in `ports` buys is
something for `targetPort` to refer to.
