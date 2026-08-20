## Hint 1

Everything the answer has to say is already written down in the object you
are replacing, so start by reading it rather than by writing YAML:

```bash
k -n lacerta describe ingress lacerta-legacy
k get gatewayclass
```

The one idea to carry across is that the Ingress does two jobs and the
Gateway API gives each of them its own object. The port, the host name and
the certificate belong to the Gateway. The paths and the backends belong to
the HTTPRoute. Neither object is any use without the other, and the
HTTPRoute is the one that has to say which Gateway it belongs to — a route
sitting in the same Namespace is not attached to anything by proximity.

There is no `kubectl create` verb for either kind, so both are written out.
`kubectl explain gateway.spec.listeners` and `kubectl explain
httproute.spec.rules` list the fields without a browser.

Leave the Ingress alone until the end. It costs nothing to keep it while
you work, and it is your only working reference for what the routing is
supposed to do.

## Hint 2

On the Gateway, the certificate goes on the listener, under
`tls.certificateRefs` — a list of references rather than the single
`secretName` string the Ingress used — with `mode: Terminate`. The listener
also needs `hostname`, and leaving it out is not a small omission here:
it is what the proxy matches the incoming SNI against.

On the HTTPRoute, `parentRefs` names the Gateway, `hostnames` repeats the
host, and each rule pairs `matches[].path` (`type: PathPrefix`) with
`backendRefs`. A backendRef takes the Service's `name` and `port` — check
each against the Service rather than assuming the two are alike.

Then read the status of both, because a wrong answer here usually looks
right:

```bash
k -n lacerta get gateway lacerta-gateway
k -n lacerta describe httproute lacerta-routes
```

`PROGRAMMED` false, or `Accepted`/`ResolvedRefs` false on the route, names
the problem for you.

If the request itself fails, read what the client says. `unrecognized name`
in a TLS error is the handshake being refused because the name offered
matches no listener — send the name in the URL, never in a `-H "Host: ..."`
header, which over TLS arrives far too late to choose anything. A `404`
means the opposite: the handshake was fine and no route claimed the
request.
