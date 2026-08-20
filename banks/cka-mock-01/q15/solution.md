# Solution 15

Nothing here is being invented from scratch. One object already says what
the answer has to say, so read it first and then take it apart:

```bash
k -n lacerta get ingress lacerta-legacy
# NAME             CLASS   HOSTS                   ADDRESS     PORTS     AGE
# lacerta-legacy   nginx   q15-lacerta.sim.local   localhost   80, 443   12m

k -n lacerta describe ingress lacerta-legacy
# TLS:
#   lacerta-tls terminates q15-lacerta.sim.local
# Rules:
#   Host                   Path       Backends
#   q15-lacerta.sim.local  /store     storefront:80 (10.244.1.7:80)
#                          /checkout  checkout:8080 (10.244.2.4:8080)

k get gatewayclass
# NAME   CONTROLLER                                    ACCEPTED   AGE
# sim    gateway.nginx.org/nginx-gateway-controller    True       31m
```

That Ingress holds two separate jobs in one object: **where TLS is
terminated** (a port, a host name and a certificate) and **which backend
each path goes to**. The Gateway API splits them, and the split is the
whole point of the migration — the Gateway belongs to whoever runs the
cluster, the HTTPRoute belongs to whoever owns the application.

| Ingress | Gateway API |
|---|---|
| `spec.ingressClassName` | `Gateway.spec.gatewayClassName` |
| the controller's implicit :80/:443 | `Gateway.spec.listeners[].port` + `.protocol` |
| `spec.tls[].hosts` | `Gateway.spec.listeners[].hostname` |
| `spec.tls[].secretName` | `Gateway.spec.listeners[].tls.certificateRefs[]` |
| `spec.rules[].host` | `HTTPRoute.spec.hostnames[]` |
| `spec.rules[].http.paths[].path` + `pathType: Prefix` | `HTTPRoute.spec.rules[].matches[].path` with `type: PathPrefix` |
| `...backend.service.name` / `.port.number` | `HTTPRoute.spec.rules[].backendRefs[].name` / `.port` |
| — | `HTTPRoute.spec.parentRefs[]`, which has no Ingress equivalent |

## The Gateway

There is no `kubectl create gateway`, so this one is written out. It is
short:

```bash
k apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: lacerta-gateway
  namespace: lacerta
spec:
  gatewayClassName: sim
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      hostname: q15-lacerta.sim.local
      tls:
        mode: Terminate
        certificateRefs:
          - kind: Secret
            name: lacerta-tls
EOF
```

Four things in there are worth knowing rather than copying:

- **`gatewayClassName: sim`** is what hands the object to a controller,
  exactly as `ingressClassName` did. A class no controller claims leaves an
  object that is stored and never acted on.
- **`protocol: HTTPS`** is what makes the listener terminate TLS. `HTTP` on
  443 would be a plaintext listener on a conventional port, and a `tls`
  block hung off it means nothing.
- **`certificateRefs`** is a list of object references, not a
  `secretName` string. `kind: Secret` is the default and may be left out; a
  reference with no `namespace` means the Gateway's own, which is where the
  seeded certificate already is. The reference is what the Ingress's
  `spec.tls[].secretName` becomes, and it moves onto the **listener** —
  a certificate is a property of the thing that answers the handshake, and
  routes never see it.
- **`mode: Terminate`** decrypts here and forwards plaintext to the
  backends. The alternative, `Passthrough`, hands the whole TLS session
  through untouched — and then nothing can read a path out of it, so no
  HTTPRoute could sort `/store` from `/checkout`.

Watch what the controller does with it:

```bash
k -n lacerta get gateway lacerta-gateway
# NAME              CLASS   ADDRESS       PROGRAMMED   AGE
# lacerta-gateway   sim     10.96.31.204  True         20s

k -n lacerta get deploy,svc
# NAME                                    READY   UP-TO-DATE   AVAILABLE
# deployment.apps/checkout                1/1     1            1
# deployment.apps/lacerta-gateway-sim     1/1     1            1
# deployment.apps/storefront              1/1     1            1
```

This controller provisions a **data plane of its own, in your Namespace**,
the moment a Gateway names its class: an nginx Deployment and a ClusterIP
Service, both named after the Gateway and the class. That is the shape the
Gateway API is built around and the second real change from Ingress, where
one shared controller in its own Namespace served every Ingress in the
cluster. Its image is already on the nodes, so it is Available within
seconds; nothing is being pulled.

Do not write that Service's name down anywhere. It is the controller's to
choose and to change. The address it holds is published on the Gateway
itself, which is what to read:

```bash
addr=$(k -n lacerta get gateway lacerta-gateway -o jsonpath='{.status.addresses[*].value}')
echo "$addr"
# 10.96.31.204
```

`PROGRAMMED` staying `False`, or the address never appearing, is the
signal worth stopping for. `k -n lacerta describe gateway lacerta-gateway`
prints the reason under the listener: a certificate reference that resolved
to nothing, a Secret that is not a TLS Secret, a class nothing claims.

## The HTTPRoute

```bash
k apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: lacerta-routes
  namespace: lacerta
spec:
  parentRefs:
    - name: lacerta-gateway
  hostnames:
    - q15-lacerta.sim.local
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /store
      backendRefs:
        - name: storefront
          port: 80
    - matches:
        - path:
            type: PathPrefix
            value: /checkout
      backendRefs:
        - name: checkout
          port: 8080
EOF
```

`parentRefs` is the field with no Ingress equivalent, and the one to
understand. An Ingress is claimed by a controller through its class; a
route is attached to a **Gateway**, by name, from the route's own side. The
Gateway can refuse — `spec.listeners[].allowedRoutes` decides which
Namespaces may attach, and its default is the Gateway's own — which is what
makes it safe to hand this object to an application team.

The rest is the Ingress rewritten. `PathPrefix` is `Prefix` under another
name: whole path segments beneath the value, so `/store` also catches
`/store/cart` but never `/storeroom`. `backendRefs` names a Service and the
port that **Service** publishes, as an Ingress backend did. Neither one
edits the request on the way through: `/store` arrives at `storefront` as
`/store`, which is why both backends here answer on every path.

Read back what the Gateway made of it:

```bash
k -n lacerta describe httproute lacerta-routes
# Status:
#   Parents:
#     Conditions:
#       Type:     Accepted           Status:  True
#       Type:     ResolvedRefs       Status:  True
```

Those two conditions fail for different reasons and both are worth
recognising. `Accepted: False` is the attachment being refused — no
listener whose host name intersects the route's, or a Namespace the
listener does not admit. `ResolvedRefs: False` is the attachment working
and a backend not resolving — a Service name that is not in this
Namespace, or a port no Service publishes.

## Testing it, and why the Host header is no help

`q15-lacerta.sim.local` is not a DNS name here. Over plain HTTP that costs
nothing: an HTTP proxy picks its rule from the `Host:` header, which is a
string the client sends, so pointing a request at the proxy's address and
adding the header is enough.

Over TLS it is not enough, and the failure is abrupt:

```bash
k -n lacerta exec deploy/storefront -- \
  curl -sSk -m 5 -H "Host: q15-lacerta.sim.local" "https://${addr}/store"
# curl: (35) ... tlsv1 unrecognized name
```

The host name has to be chosen during the **handshake**, in SNI, and a
`Host:` header travels inside the encrypted request that only exists once
the handshake has succeeded. This proxy answers a name it has no listener
for by closing the connection with `unrecognized name`, so the header is
never read at all.

What the client needs is to *use* the name and be told where it lives.
`--resolve` does exactly that — it fills in the DNS answer without a
resolver, and the URL still carries the name, so SNI, the `Host:` header
and the certificate check all get it:

```bash
k -n lacerta exec deploy/storefront -- curl -sSk -m 5 \
  --resolve "q15-lacerta.sim.local:443:${addr}" \
  "https://q15-lacerta.sim.local/store"
# storefront-ok

k -n lacerta exec deploy/storefront -- curl -sSk -m 5 \
  --resolve "q15-lacerta.sim.local:443:${addr}" \
  "https://q15-lacerta.sim.local/checkout"
# checkout-ok
```

Three details in that command earn their place:

- **The request comes from inside the cluster.** The Gateway's address is a
  ClusterIP; from your terminal it is not an address at all. `k exec` into
  a Pod that is already there is the cheapest way in.
- **`-k`.** The certificate is self-signed by the setup and no client here
  trusts it. Without `-k` the handshake completes and curl then refuses the
  certificate, which is a different failure and easy to misread.
- **`-sS`.** `-s` alone hides curl's own errors as well as the progress
  meter, and a silent empty answer is the one result you cannot diagnose.

A client with no `--resolve` — BusyBox `wget`, for instance — gets there by
giving the name a real answer inside the Pod, which works just as well and
disappears with the container:

```bash
k -n lacerta exec deploy/storefront -- sh -c \
  "echo '${addr} q15-lacerta.sim.local' >> /etc/hosts;
   wget -q -T 5 -O- --no-check-certificate https://q15-lacerta.sim.local/store"
```

One trap if you script that: `wget ... | head -3` reports `head`'s exit
status, so a rejected handshake can look like a success. Leave it unpiped.

## Retiring the Ingress

```bash
k -n lacerta delete ingress lacerta-legacy
```

Last, and only once the new path answers. Nothing in Kubernetes prevents
two controllers from serving one host name — ingress-nginx and this Gateway
each hold their own copy of the certificate and answer on their own address
— so the overlap while you work is free, and deleting the old object first
would simply take the host down until the new one is finished.

What deliberately does **not** move: the two Deployments, the two Services,
and the Secret. A migration that recreates its own certificate has changed
what clients see for no reason, and Services stay `ClusterIP` — an
HTTPRoute reaches them exactly as an Ingress did.
