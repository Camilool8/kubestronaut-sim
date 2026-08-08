Namespace `sculptor` runs Deployment `portal`, already exposed inside the
cluster by a ClusterIP Service named `portal` on port `80`. It has to be
published over HTTPS at the host name `sculptor.sim.local`, and this
cluster has no certificate authority to ask.

1. Generate a self-signed certificate and its private key for
   `sculptor.sim.local`, and save them as `/opt/course/37/tls.crt` and
   `/opt/course/37/tls.key` on `instance-1`. `openssl` is installed.
2. Create a Secret named `portal-tls` in Namespace `sculptor`, of type
   `kubernetes.io/tls`, from those two files.
3. Create an Ingress named `portal-https` in Namespace `sculptor` using
   IngressClass `nginx`. It serves host `sculptor.sim.local`, routes path
   `/` by **prefix** to Service `portal` on port `80`, and terminates TLS
   for that host with Secret `portal-tls`.

The certificate signs for itself, so any client that checks it will
refuse it — test with `curl -k`. The Ingress matches on the host name,
and that name resolves nowhere, so the request also has to be pointed at
the controller by hand:

```bash
ip=$(k -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.spec.clusterIP}')
k -n sculptor exec deploy/portal -- \
  curl -sk --resolve "sculptor.sim.local:443:${ip}" https://sculptor.sim.local/
```

The application answers with a single word, so you can tell it apart from
the controller's own error pages.
