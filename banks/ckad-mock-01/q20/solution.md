# Solution 20

Two fields change, both on the Service:

```bash
k -n aquila edit svc status-page
```

```yaml
spec:
  type: NodePort        # was ClusterIP
  selector:
    app: status-page
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30081   # add: without this you get a random port
```

Or in one command:

```bash
k -n aquila patch svc status-page --type=merge -p \
  '{"spec":{"type":"NodePort","ports":[{"port":80,"targetPort":80,"nodePort":30081}]}}'
```

Check what you got — the `PORT(S)` column shows both:

```bash
k -n aquila get svc status-page
# NAME          TYPE       CLUSTER-IP     PORT(S)        AGE
# status-page   NodePort   10.96.51.203   80:30081/TCP   3m
```

Then confirm from a node address, and save the answer:

```bash
k get nodes -o wide     # note an INTERNAL-IP, e.g. 172.18.0.3

k -n aquila run probe --rm -i --restart=Never --image=nginx:1.29-alpine -- \
  curl -s http://172.18.0.3:30081/ > /opt/course/20/nodeport-check
cat /opt/course/20/nodeport-check
# status-ok
```

Testing the node address matters. A Service still on `ClusterIP` answers
perfectly on its cluster IP, so curling the ClusterIP proves nothing
about the change you were asked to make.

## What a NodePort actually is

It is a ClusterIP Service **plus** a port opened on every node. The
cluster IP keeps working; the node port is additional. Traffic to
`<any-node>:30081` is forwarded by kube-proxy to a ready Pod — which may
be on a different node entirely. There is no need to find the node the
Pod is on.

The range is `30000-32767` by default. Omit `nodePort` and you get one
allocated at random, which is normally what you want; pinning it, as
here, is for cases where something outside the cluster has the number
written down. Pin a port already in use and the Service is rejected.

## The three Service types

| Type | Reachable from |
|---|---|
| `ClusterIP` | Inside the cluster only (the default) |
| `NodePort` | The above, plus `<node>:<nodePort>` |
| `LoadBalancer` | The above, plus an external address the cloud provider assigns |

`LoadBalancer` on a cluster with no provider — like this one — stays
`Pending` forever on its external IP. Its node port still works, because
a LoadBalancer is a NodePort with an extra step.

## In this simulator

`30081` is one of three node ports published to the machine running
Docker, so `curl http://localhost:30081` reaches it from your own
terminal. That is a convenience for learning, not part of the exam: the
grader tests from inside the cluster, and so should you.
