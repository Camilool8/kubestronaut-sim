# Solution 14

Start with what the cluster already provides. Two of the three things this
question needs exist before you type anything, and only the routing is yours:

```bash
k get gatewayclass
# NAME   CONTROLLER                                   ACCEPTED   AGE
# sim    gateway.nginx.org/nginx-gateway-controller   True       34m

k -n dorado get deploy,svc
# NAME                         READY   UP-TO-DATE   AVAILABLE   AGE
# deployment.apps/dorado-web   2/2     2            2           34m
#
# NAME                 TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
# service/dorado-web   ClusterIP   10.96.129.204   <none>        80/TCP    34m
```

`ACCEPTED True` on the class is the controller saying it will serve Gateways
that ask for it by that name. That name — `sim` — is the one field a Gateway
cannot get wrong and recover from, because `gatewayClassName` is immutable
once the object exists.

## Two objects, and which one owns what

The Gateway API splits in two what an Ingress packs into one object, and the
split is the whole point of the API:

- The **Gateway** is infrastructure: a class, and listeners (protocol, port,
  a name, and which routes are allowed to attach). It says *where traffic
  arrives*. It names no application.
- The **HTTPRoute** is application routing: hostnames, path matches, and the
  backend Services. It says *where a request goes*, and it names the Gateway
  it wants to attach to in `parentRefs`.

The reference goes from route to Gateway, never the other way. A Gateway has
no list of its routes, which is exactly why a route that attaches to nothing
is silent — more on that below.

There is no `kubectl create gateway` and no `kubectl create httproute`. This
API ships no generators, so both objects are YAML. `k explain
gateway.spec.listeners --recursive` is read from the CRDs installed on this
cluster and beats a browser round-trip when a field name is all you need.

## The Gateway

```bash
k apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: dorado-gateway
  namespace: dorado
spec:
  gatewayClassName: sim
  listeners:
    - name: http
      protocol: HTTP
      port: 80
EOF
```

Read it back rather than assuming:

```bash
k -n dorado get gateway
# NAME             CLASS   ADDRESS         PROGRAMMED   AGE
# dorado-gateway   sim     10.96.184.226   True         25s
```

Two columns carry the answer. `PROGRAMMED True` is the controller reporting
that it has provisioned the proxy this Gateway describes; `ADDRESS` is where
that proxy can be reached. Neither appears instantly — this controller runs
one nginx deployment **per Gateway**, in the Gateway's own Namespace, and
creating it takes a few seconds:

```bash
k -n dorado get deploy,svc
# NAME                                READY   UP-TO-DATE   AVAILABLE   AGE
# deployment.apps/dorado-gateway-sim  1/1     1            1           25s
# deployment.apps/dorado-web          2/2     2            2           35m
#
# NAME                         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
# service/dorado-gateway-sim   ClusterIP   10.96.184.226   <none>        80/TCP,443/TCP 25s
# service/dorado-web           ClusterIP   10.96.129.204   <none>        80/TCP         35m
```

That Deployment and Service appeared because the Gateway did, and they will
disappear with it. Three things follow, and the third is worth carrying past
this exam:

- **The address in `ADDRESS` is that Service's ClusterIP.** Read it from the
  Gateway, not from the Service: `.status.addresses` is where the API
  promises to publish it, while the provisioned object's name is this
  controller's own convention and nothing in the API guarantees it.
- **It is a ClusterIP**, so nothing outside the cluster can reach it. On a
  cloud cluster this Service would be a LoadBalancer with an external
  address; here it is deliberately internal, and a Pod is the way in.
- **The controller in `nginx-gateway` is not the data plane.** That
  Deployment watches the API and writes configuration; its own Service
  publishes only 443, which is the channel it uses to configure the nginx
  Pods. Sending an HTTP request there proves nothing and reaches nothing.

If `PROGRAMMED` stays blank or `False`, `k -n dorado describe gateway
dorado-gateway` prints the reason. `GatewayClass ... does not exist` or an
unsupported listener protocol are the two you will see; both mean no proxy
was provisioned, so there is no point testing routing yet.

## The HTTPRoute

```bash
k apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: dorado-web-route
  namespace: dorado
spec:
  parentRefs:
    - name: dorado-gateway
  hostnames:
    - web.sim.internal
  rules:
    - backendRefs:
        - name: dorado-web
          port: 80
EOF
```

Four fields, and three of them are traps:

- **`parentRefs`** points at the Gateway by name. Because the route and the
  Gateway are in the same Namespace, no `namespace:` field is needed; a route
  in another Namespace would need one *and* a Gateway whose listener allows
  routes from there, since `allowedRoutes` defaults to the Gateway's own
  Namespace.
- **`hostnames`** is matched against the request's `Host` header. Omitting it
  is legal and means "every name that arrives at this listener", which is
  broader than this question asks for.
- **`port` under `backendRefs` is the port the Service publishes**, not the
  container's. `dorado-web` publishes 80 and forwards to 8080 itself; 8080
  here would name a port the Service does not have.
- The `rules` entry declares no `matches`, which defaults to path prefix `/`
  — every path. That is what the question wants, and it is why the whole rule
  is one `backendRefs` list.

## The check nobody makes: did it attach?

An HTTPRoute whose `parentRefs` names a Gateway that does not exist is
accepted by the API without complaint. No error, no event, no warning in any
`get` output — the object simply sits there routing nothing, because a
Gateway holds no list of routes and therefore nothing is left dangling to
notice. The only place the truth is written is the route's own status:

```bash
k -n dorado get httproute dorado-web-route -o jsonpath='{.status.parents}' | jq
# [
#   {
#     "conditions": [
#       {"type": "Accepted",     "status": "True", "reason": "Accepted"},
#       {"type": "ResolvedRefs", "status": "True", "reason": "ResolvedRefs"}
#     ],
#     "controllerName": "gateway.nginx.org/nginx-gateway-controller",
#     "parentRef": {"group": "gateway.networking.k8s.io", "kind": "Gateway", "name": "dorado-gateway"}
#   }
# ]
```

Read it as three separate facts:

| What you see | What it means |
|---|---|
| `status.parents` is empty | **Nothing claimed the route.** The `parentRefs` name (or Namespace) matches no Gateway, so no controller ever looked at it |
| `Accepted=False` | A Gateway was found and refused the route — the listener does not allow routes from this Namespace, or the `sectionName` names no listener |
| `ResolvedRefs=False` | Attached, but a `backendRefs` entry points at nothing: the Service name or its port |
| both `True` | The route is live on that Gateway |

Make this the habit the moment you write an HTTPRoute. It costs one command
and it is the only feedback this API gives you.

## Testing it: the host resolves nowhere

`web.sim.internal` is not a DNS name in this cluster, and nothing here will
make it one. `curl http://web.sim.internal/` fails to resolve however correct
your objects are — and this cluster has a *separate* question about a broken
`sim.internal` stub zone, so chasing the lookup here is chasing someone
else's fault. An HTTPRoute hostname is matched against the `Host` header,
which is a string the client sends and not something DNS produces:

```bash
addr=$(k -n dorado get gateway dorado-gateway -o jsonpath='{.status.addresses[0].value}')
echo "$addr"
# 10.96.184.226

k -n dorado exec deploy/dorado-web -- curl -s -m 3 -H "Host: web.sim.internal" "http://${addr}/"
# dorado-ok
```

Three details in that command earn their place:

- **The request comes from a Pod**, because the address is a ClusterIP.
  `k exec` into a workload the question already runs is the cheapest way in;
  a Pod created for the purpose has to be scheduled and pulled first, and the
  clock is running.
- **`-m 3`.** A request to an address whose proxy was never programmed does
  not always come back with an error — it can sit there. A hung `curl` is
  worse than a failed one.
- **The `Host` header, not the URL.** `--resolve web.sim.internal:80:${addr}`
  fakes the DNS answer instead and does the same job. Over plain HTTP the
  header is enough; for an HTTPS listener you would need `--resolve`, because
  the certificate is chosen by SNI during the handshake and a header sent
  afterwards arrives far too late.

## Reading the reply

| Reply | What it means |
|---|---|
| `dorado-ok` | Done |
| `404 Not Found` | The request arrived and **no route claimed it**: the `Host` header does not match `hostnames`, or the route never attached |
| `500` from nginx | A route claimed it and its `backendRefs` resolved to nothing — the Service name, or the port |
| nothing, connection refused, or a timeout | Not the route at all: the listener is not on 80, the address belongs to a Gateway that is no longer Programmed, or the provisioned nginx has not finished rolling out |

The `404` is the case this question is built to produce, and it is worth
knowing which two mistakes make it. A typo in `parentRefs` gives you one; so
does a hostname the request does not carry. They are indistinguishable from
the reply and trivially distinguishable from `status.parents`, which is the
argument for looking there first.

## Why any of this beats an Ingress

The same job as an Ingress, in twice the objects — the trade is what those
objects let you separate:

- **Roles split.** A cluster operator owns the Gateway (the listeners, the
  TLS, the address); an application team owns the HTTPRoute in its own
  Namespace and can publish a new host without touching shared
  infrastructure. An Ingress is one object and one owner.
- **The routing is typed.** Header matching, weighted backends and path
  rewriting are fields in the HTTPRoute schema, so `kubectl explain` and the
  API's own validation apply to them. On an Ingress the same features are
  controller-specific annotations — unvalidated strings that differ per
  controller and fail by doing nothing.
- **Status says what happened.** An Ingress gives you an `ADDRESS` column and
  little else; a Gateway reports Accepted and Programmed, and every route
  reports whether it attached and whether its backends resolved.
