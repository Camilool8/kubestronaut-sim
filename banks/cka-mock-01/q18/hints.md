## Hint 1

The controller is already installed and already watching every Namespace,
so the only object missing is the Ingress itself. Ask the cluster which
class name it registers rather than assuming one:

```bash
k get ingressclass
```

One Ingress, one host, two paths. `kubectl create ingress` will take the
whole thing on one line if you would rather not write the YAML — one
`--rule` per path, spelled `host/path=service:port` — but read back what
it produced before you trust it.

Read the two Services before you write the backends. They do not both
listen on `80`, and the number that belongs in a backend is the port the
**Service** publishes.

## Hint 2

Both paths belong to the same host. Two entries under one `host:`, or two
rules repeating the same host, are the same thing to the controller — but
a rule with no host at all matches every name that arrives, which is not
the routing the question describes.

If you built the object with `kubectl create ingress`, look at the
`pathType` it wrote. A rule spelled `--rule="q18-phoenix.sim.local/api=api:8080"`
comes out `Exact`; only a path ending in `*` comes out `Prefix`, and the
`*` is stripped from the path it stores.

Then run the test from the question and read the reply rather than
retrying it:

- `404` — the request arrived and no rule claimed it. That is the host in
  the header, or the path.
- `503` — a rule claimed it and found nothing behind the backend. That is
  almost always the port number.
- an empty `ADDRESS` column on `k -n phoenix get ingress` — no controller
  has claimed the object at all, which is `ingressClassName`.
