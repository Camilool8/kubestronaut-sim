# Solution 39

Look at what is already there before writing anything — the StatefulSet
tells you the Service's name and the label to select:

```bash
k -n telescopium get sts shard -o jsonpath='{.spec.serviceName}{"\n"}'
# shard
k -n telescopium get pod --show-labels
# shard-0  ...  app=shard,...
```

## The Service

```bash
k -n telescopium apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: shard
  namespace: telescopium
spec:
  clusterIP: None
  selector:
    app: shard
  ports:
    - port: 80
      targetPort: 80
EOF
```

Or with the generator:

```bash
k -n telescopium create service clusterip shard --clusterip=None --tcp=80:80
```

`create service clusterip` does not set a selector matching these Pods —
it labels the Service `app=shard` and selects the same — which happens to
be right here. Check it either way:

```bash
k -n telescopium get svc shard
# NAME    TYPE        CLUSTER-IP   PORT(S)   AGE
# shard   ClusterIP   None         80/TCP    4s
```

`None` in the `CLUSTER-IP` column is the whole answer. The type still
reads `ClusterIP`; headless is not a fourth Service type.

## The names it publishes

```bash
k -n telescopium exec shard-0 -- nslookup shard.telescopium.svc.cluster.local
# Name:    shard.telescopium.svc.cluster.local
# Address: 10.244.1.12
# Address: 10.244.2.9
# Address: 10.244.1.13

k -n telescopium exec shard-0 -- curl -s http://shard-2.shard.telescopium.svc.cluster.local/
# shard-2
```

Two kinds of record appear at once:

| Name | Answers with |
|---|---|
| `shard.telescopium.svc.cluster.local` | every ready Pod address, all three |
| `shard-N.shard.telescopium.svc.cluster.local` | that one Pod's address |

The per-Pod names are the reason a StatefulSet wants a headless Service.
The controller gives each Pod a stable `hostname` and sets its
`subdomain` to `spec.serviceName`; the cluster's DNS publishes that pair
as a name **only for a headless Service**. Point the same StatefulSet at
an ordinary ClusterIP Service and the per-Pod names silently stop
resolving while everything else keeps working.

## Record the addresses

```bash
k -n telescopium get endpointslice -l kubernetes.io/service-name=shard \
  -o jsonpath='{range .items[*].endpoints[*]}{.addresses[0]}{"\n"}{end}' \
  > /opt/course/39/shard-addresses
cat /opt/course/39/shard-addresses
```

The EndpointSlice is where the addresses come from in the first place —
the DNS answer is generated from it, so the two always agree. Reading it
avoids parsing `nslookup` output, which mixes the resolver's own address
in with the answers.

## What headless actually changes

- **No virtual IP is allocated**, so kube-proxy programs nothing and
  there is no load balancing, no `sessionAffinity` and no NAT. Clients
  get addresses and choose for themselves.
- **The name resolves to the Pods.** A client that resolves once and
  holds the connection is talking to one specific Pod, not to a Service
  that may move it.
- **`port` and `targetPort` stop renumbering anything** for those direct
  connections; they still describe the Service and appear in its SRV
  records.

Reach for it when the caller has to address individual members — a
database with a primary, a quorum that gossips, a client library that
does its own connection pooling. Everything else wants an ordinary
ClusterIP.

## A headless Service with no selector

Leave the selector out as well and nothing is published at all until you
write the EndpointSlice yourself. That is how a name inside the cluster
is pointed at addresses Kubernetes does not manage — the sibling of the
`ExternalName` trick, for when you have addresses rather than a name.
