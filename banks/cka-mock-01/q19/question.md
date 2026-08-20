Deployment `orders-api` in Namespace `volans` runs a single container named
`api`. It writes its application log to the file
`/var/log/orders/app.log` and prints nothing at all on stdout, so
`kubectl logs` for that container is empty and nobody can see what the
service is doing:

```bash
k -n volans logs deploy/orders-api -c api
```

Get those lines onto a container log by adding a **native sidecar** to the
same Pod. Change nothing else — the `api` container keeps its name, its
image and its command.

1. Add an `emptyDir` volume named `orders-logs` to the Pod template, and
   mount it at `/var/log/orders` in the existing `api` container.
2. Add a container named `shipper`, image `busybox:1.37`, running exactly
   `sh -c "tail -F /var/log/orders/app.log"`.
3. `shipper` must be a **native sidecar**: an entry under
   `initContainers` carrying `restartPolicy: Always`. A second entry under
   `containers` is not accepted here.
4. Mount the same `orders-logs` volume at `/var/log/orders` in `shipper`
   as well.

You are finished when the sidecar's own log carries the application's
lines:

```bash
k -n volans logs deploy/orders-api -c shipper --tail=5
```
