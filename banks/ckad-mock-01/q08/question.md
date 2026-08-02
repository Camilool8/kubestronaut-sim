Namespace `helios` runs two Deployments, `storefront` and `checkout`,
each already exposed by a ClusterIP Service of the same name on port
`80`.

Create a single Ingress named `helios-routes` in Namespace `helios`
that serves host `helios.sim.local` using IngressClass `nginx`:

- requests to `/` go to Service `storefront` on port `80`
- requests to `/checkout` go to Service `checkout` on port `80`

Both rules must match by path **prefix**.

The cluster runs a real ingress controller, so verify your answer rather
than trusting it — from inside the cluster:

```bash
k -n helios run probe --rm -it --restart=Never --image=nginx:alpine -- \
  curl -s -H 'Host: helios.sim.local' http://ingress-nginx-controller.ingress-nginx.svc/
```

`storefront` answers `storefront` and `checkout` answers `checkout`, so
you can tell which backend you reached.
