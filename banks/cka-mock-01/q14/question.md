Namespace `dorado` runs Deployment `dorado-web`, already exposed inside the
cluster by a ClusterIP Service of the same name on port `80`. The cluster
runs a Gateway API controller, and the GatewayClass it serves is `sim`.

Publish that Service through the Gateway API. Leave the Deployment and the
Service themselves exactly as they are.

1. Create a Gateway named `dorado-gateway` in Namespace `dorado`, using
   GatewayClass `sim`, with a single listener named `http` serving protocol
   `HTTP` on port `80`.
2. Create an HTTPRoute named `dorado-web-route` in the same Namespace. It
   attaches to that Gateway, matches host `web.sim.internal`, and sends the
   requests it matches to Service `dorado-web` on port `80`.

`web.sim.internal` is a routing key, not a DNS name. Nothing in this cluster
resolves it, nothing here will add a record for it, and the routing does not
need one — an HTTPRoute hostname is matched against the `Host` header the
client sends. So do not test it by name and do not go hunting for a
name-resolution fault.

The Gateway publishes the address the controller gave it, and that address is
a ClusterIP, so the request has to come from a Pod:

```bash
addr=$(k -n dorado get gateway dorado-gateway -o jsonpath='{.status.addresses[0].value}')
echo "$addr"
k -n dorado exec deploy/dorado-web -- curl -s -m 3 -H "Host: web.sim.internal" "http://${addr}/"
```

The application answers with a single word, `dorado-ok`.
