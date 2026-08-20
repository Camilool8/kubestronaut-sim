## Hint 1

Two objects, in this order. The name goes on the Pod template first,
because the Service can only refer to a name that already exists:

```bash
k -n gemini edit deploy pollux-web
```

Naming a port rewrites the Pod template, so the Deployment rolls. Let it
finish before you test anything.

For the Service, `kubectl expose` gets you close but not all the way —
it cannot pin a node port, so whatever it writes still needs editing.

## Hint 2

In the Deployment's container:

```yaml
ports:
  - name: http-web
    containerPort: 8080
```

In the Service, all three fields live in the same `ports` entry:

```yaml
spec:
  type: NodePort
  selector:
    app: pollux-web
  ports:
    - port: 80
      targetPort: http-web
      nodePort: 30081
```

Check what the name resolved to before you curl anything — the endpoint
list carries the number, and `8080` there means the lookup found the
container's port:

```bash
k -n gemini get endpointslice -l kubernetes.io/service-name=pollux-web
```

Then curl `http://<node-internal-ip>:30081/` from a Pod in the cluster,
taking the address from `k get nodes -o wide`.
