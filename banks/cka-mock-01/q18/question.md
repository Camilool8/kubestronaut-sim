Namespace `phoenix` runs two Deployments, `api` and `web`, each already
exposed inside the cluster by a ClusterIP Service of the same name — `api`
on port `8080` and `web` on port `80`.

Publish both behind one host name through the cluster's ingress-nginx
controller.

Create a single Ingress named `phoenix-routes` in Namespace `phoenix`,
using IngressClass `nginx`, serving host `q18-phoenix.sim.local`:

- requests to `/api` go to Service `api` on port `8080`
- requests to `/web` go to Service `web` on port `80`

Both rules must match by path **prefix**, and the Ingress must carry no
rule under any other host.

That host name resolves nowhere in this cluster and nothing here will add
a record for it, so do not test it through DNS. Send the request to the
controller's own address with the name in a header instead:

```bash
ip=$(k -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.spec.clusterIP}')
k -n phoenix exec deploy/api -- curl -s -m 3 -H "Host: q18-phoenix.sim.local" "http://${ip}/api"
k -n phoenix exec deploy/api -- curl -s -m 3 -H "Host: q18-phoenix.sim.local" "http://${ip}/web"
```

`api` answers `api-ok` and `web` answers `web-ok`, so the reply tells you
which backend you reached.
