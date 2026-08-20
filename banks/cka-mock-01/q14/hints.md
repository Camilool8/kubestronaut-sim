## Hint 1

The controller is already installed and already watching every Namespace, so
the two objects the question names are the only ones missing. Ask the cluster
for the class name rather than assuming it:

```bash
k get gatewayclass
```

There is no `kubectl create gateway` and no `kubectl create httproute` — this
API has no generators at all. Copy the two examples out of the Gateway API
documentation and edit them; typing either from memory under a clock is how
the field names go wrong.

The shape to keep straight: the **Gateway** owns the listener (protocol,
port, a name), and the **HTTPRoute** owns the routing (which host, which
backend Service and which of its ports). The route names the Gateway in
`parentRefs`; the Gateway never names the route.

## Hint 2

Create the Gateway first, then read it back before writing the route:

```bash
k -n dorado get gateway dorado-gateway
# NAME             CLASS   ADDRESS         PROGRAMMED   AGE
# dorado-gateway   sim     10.96.184.226   True         20s
```

An empty `ADDRESS` with `PROGRAMMED` blank or `False` means no data plane was
provisioned, and that is `gatewayClassName` far more often than anything else.
`k -n dorado describe gateway dorado-gateway` prints the controller's reason.

Then check that the route actually attached, because nothing will tell you if
it did not:

```bash
k -n dorado get httproute dorado-web-route -o jsonpath='{.status.parents}' | jq
```

A route whose `parentRefs` names a Gateway that does not exist — a typo, or
the right name in the wrong Namespace — gets no error, no event and an empty
`status.parents`: no controller claimed it, so no controller had anything to
say. `Accepted=True` means it attached; `ResolvedRefs=False` means it attached
and its backend does not resolve, which is the Service name or the port.

When you test it, remember what the reply means. `404` is the request arriving
and no route claiming it: the `Host` header against the route's `hostnames`.
`500` is a route claiming it with nothing behind it. Nothing at all is the
listener rather than the route.
