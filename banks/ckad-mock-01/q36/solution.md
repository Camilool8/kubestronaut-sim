# Solution 36

An `ExternalName` Service is two fields and nothing else — no selector,
no ports, no cluster IP:

```bash
k -n octans apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: catalog
  namespace: octans
spec:
  type: ExternalName
  externalName: catalog.mensa.svc.cluster.local
EOF
```

The generator writes the same object in one line, which is faster under
a clock:

```bash
k -n octans create service externalname catalog \
  --external-name=catalog.mensa.svc.cluster.local
```

Then prove it and record the answer:

```bash
k -n octans exec deploy/shopfront -- curl -s http://catalog/
# catalog-mensa

k -n octans exec deploy/shopfront -- curl -s http://catalog/ \
  > /opt/course/36/catalog-check
cat /opt/course/36/catalog-check
```

## What actually happens to the request

Nothing in the data path. This is the one Service type that is purely a
DNS answer:

1. `shopfront` resolves `catalog`. The Pod's search list turns that into
   `catalog.octans.svc.cluster.local`.
2. CoreDNS finds the ExternalName Service and answers with a **CNAME**
   pointing at `catalog.mensa.svc.cluster.local`.
3. That target is inside the cluster's own zone, so CoreDNS resolves it
   too and returns the `mensa` Service's cluster IP in the same answer.
4. The client connects to that address. kube-proxy forwards it to a
   `catalog` Pod in `mensa`, exactly as it would for any ClusterIP.

There is no proxying, no second hop and no object in `octans` holding an
address. Delete the Service in `mensa` and the alias resolves to nothing.

## Why the name has to be fully qualified

CoreDNS chases a CNAME itself only when the target is inside the zone it
serves. `catalog.mensa.svc.cluster.local` is; `catalog.mensa` is not, so
that answer would be handed to the upstream resolver, which has never
heard of it. The Pod's search list does not help here — it is applied to
what the *client* asked for, not to a CNAME target the server returned.

## Where this is worth reaching for

- A managed database or an S3-compatible endpoint, so application config
  says `db` and the environment decides which host that is.
- Migrating a workload between Namespaces or clusters: point the alias at
  the new place and nothing that calls it has to be rebuilt.
- It carries **no** port mapping. Whatever port the client asks for is
  the port it gets on the target, so an ExternalName cannot renumber a
  service the way a ClusterIP's `port`/`targetPort` pair can.

## The one that catches people

`https://` to an ExternalName usually fails certificate verification. The
client asked for `catalog`, so that is the name it puts in SNI and the
name it checks the certificate against, while the certificate names the
real host. TLS sees through the alias even though the connection does
not.
