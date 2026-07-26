# Solution 8

Look at what you have first — the Services are already there, so the
answer is one object:

```bash
k -n helios get deploy,svc
```

```bash
k -n helios apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: helios-routes
  namespace: helios
spec:
  ingressClassName: nginx
  rules:
    - host: helios.sim.local
      http:
        paths:
          - path: /checkout
            pathType: Prefix
            backend:
              service:
                name: checkout
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: storefront
                port:
                  number: 80
EOF
```

`kubectl create ingress` also does this in one line, and is faster under
time pressure:

```bash
k -n helios create ingress helios-routes --class=nginx \
  --rule="helios.sim.local/*=storefront:80" \
  --rule="helios.sim.local/checkout*=checkout:80"
```

The `*` suffix is what makes it `Prefix`; without it you get `Exact`,
and `/checkout/confirm` would stop matching.

## Verify

An Ingress that the controller never admitted looks identical to one that
works, so check the routing rather than the YAML:

```bash
k -n helios run probe --rm -it --restart=Never --image=nginx:alpine -- \
  curl -s -H 'Host: helios.sim.local' http://ingress-nginx-controller.ingress-nginx.svc/
# storefront

k -n helios run probe --rm -it --restart=Never --image=nginx:alpine -- \
  curl -s -H 'Host: helios.sim.local' http://ingress-nginx-controller.ingress-nginx.svc/checkout
# checkout
```

`k -n helios describe ingress helios-routes` shows the controller's own
events, which is where an admission failure appears.

In this simulator you can also reach it from the machine running Docker,
which the real exam does not offer:

```bash
curl -H 'Host: helios.sim.local' http://localhost:8081/
```

## Why the host header

The Ingress matches on `Host`, and `helios.sim.local` resolves nowhere.
Sending the header is how you reach a host-based rule without DNS. Drop
it and you get the controller's default backend — a 404 that looks like a
broken Ingress but is the controller correctly telling you no rule
matched.

## Path ordering

ingress-nginx sorts by descending path length, so `/checkout` wins over
`/` regardless of the order you list them. Do not rely on that in other
controllers: with `Prefix` matching, the more specific rule winning is
guaranteed by the Ingress spec itself, but only for paths — overlapping
hosts are a different matter.
