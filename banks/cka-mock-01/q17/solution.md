# Solution 17

The order matters: a Service can only refer to a port name that already
exists, so the Deployment is edited first.

```bash
k -n gemini edit deploy pollux-web
```

```yaml
        ports:
          - name: http-web     # add
            containerPort: 8080
```

Or as a patch — the container is named, so the merge lands on the right
one, and `containerPort` is the merge key inside `ports`:

```bash
k -n gemini patch deploy pollux-web --type=strategic -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"web","ports":[{"name":"http-web","containerPort":8080,"protocol":"TCP"}]}]}}}}'
```

That rewrites the Pod template, so the Deployment rolls. The old Pods do
not have the name; wait for the new ones:

```bash
k -n gemini rollout status deploy/pollux-web
```

Now the Service. All three fields — `port`, `targetPort`, `nodePort` —
belong to one entry of the `ports` list:

```bash
k apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: pollux-web
  namespace: gemini
spec:
  type: NodePort
  selector:
    app: pollux-web
  ports:
    - port: 80
      targetPort: http-web
      nodePort: 30081
EOF
```

`kubectl expose deploy pollux-web --type=NodePort --port=80
--target-port=http-web` writes the same object, selector included, and
takes the name for `--target-port` — but it has no flag for a node port,
so it hands you a random one from the range and you patch it afterwards
anyway.

Check what the name resolved to before curling anything. The endpoint
list is where the lookup lands, and the `PORTS` column carries the number
the name became:

```bash
k -n gemini get endpointslice -l kubernetes.io/service-name=pollux-web
# NAME               ADDRESSTYPE   PORTS   ENDPOINTS
# pollux-web-x7k2p   IPv4          8080    10.244.1.9,10.244.2.6

k -n gemini get svc pollux-web
# NAME         TYPE       CLUSTER-IP      PORT(S)        AGE
# pollux-web   NodePort   10.96.140.11    80:30081/TCP   20s
```

Then prove it from a node's own address, from inside the cluster, using
a Pod the question already runs:

```bash
k get nodes -o wide       # note an INTERNAL-IP, e.g. 172.18.0.4

k -n gemini exec deploy/pollux-web -- curl -s http://172.18.0.4:30081/
# pollux-ok
```

Any node's address answers. kube-proxy programs a node port on every
node, so the one you pick has nothing to do with where the Pods are.

## Why name the port at all

`containerPort` opens nothing — a container listening on 8080 is
reachable whether or not the Pod spec mentions 8080 anywhere. What the
entry buys you is somewhere to hang a name, and the name is the only
thing `targetPort` can point at other than a number.

The number and the name behave identically today. They stop being
identical the day the application moves to another port:

- `targetPort: 8080` has to be changed in the Deployment *and* in the
  Service, and a Service nobody remembered to edit keeps forwarding to a
  port nothing listens on.
- `targetPort: http-web` follows the container. The Deployment changes,
  the name goes with it, and the Service is not touched.

It is the same argument as referring to a ConfigMap key by name instead
of copying its value: one place holds the fact, and everything else
refers to it.

## What a port name may be

Port names are validated where `targetPort` is not, which is worth
knowing before you invent one under time pressure. A port name is an
IANA service name:

- at most **15 characters** — long descriptive names are rejected
- lowercase letters, digits and `-` only
- at least one letter, so `8080` is not a legal name
- no leading or trailing `-`, and no `--` inside
- unique within the Pod

Get one of those wrong and the API rejects the Deployment immediately,
with the field and the rule in the message. `targetPort` on the Service
side gets no such treatment: any string is accepted there and is only
looked up when endpoints are written, so a name that resolves nowhere
produces an empty `PORTS` column and no error anywhere.

## What NodePort adds

A NodePort Service **is** a ClusterIP Service, plus a port opened on
every node:

| Reached at | Works with type |
|---|---|
| `pollux-web.gemini.svc:80` | `ClusterIP`, `NodePort`, `LoadBalancer` |
| `<any-node-ip>:30081` | `NodePort`, `LoadBalancer` |
| An address a cloud provider assigns | `LoadBalancer` only |

The cluster IP keeps working exactly as before, which is why nothing
inside the cluster notices the type change — and why curling the cluster
IP proves nothing about the node port you were asked for. Test the node
address, as the grader does.

The node-port range is `30000-32767` by default. Leave `nodePort` out and
one is allocated at random, which is normally what you want; pin it, as
here, when something outside the cluster has the number written down. Pin
one already taken and the Service is rejected rather than quietly moved
elsewhere.

## In this simulator

`30081` is one of three node ports (`30080-30082`) forwarded from the
control-plane node out to the machine running Docker, so
`curl http://localhost:30081/` answers from your own terminal once the
Service exists. That is a convenience for learning. The real exam has no
such path, the grader does not use it, and a check that depended on it
would be grading Docker's port publishing rather than your Service.
