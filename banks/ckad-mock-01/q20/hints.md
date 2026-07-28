## Hint 1

A NodePort Service is a superset of a ClusterIP one — you are
changing a type and adding a field, not replacing the object.

The pinned port is a field you set explicitly; left alone, Kubernetes
picks one at random from the range.

## Hint 2

`spec.type: NodePort` and `spec.ports[0].nodePort: 30081`, keeping
`port: 80`.

`kubectl -n aquila edit svc status-page` works, or
`kubectl -n aquila patch svc status-page` with a JSON patch.

To reach it the way the grader does, get a node IP from
`kubectl get nodes -o wide` and curl `http://<node-ip>:30081` from a Pod
inside the cluster.
