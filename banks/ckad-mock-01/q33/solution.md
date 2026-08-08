# Solution 33

Start with the Service, because it decides whether any of this is
possible:

```bash
k -n lupus get svc search -o jsonpath='{.spec.selector}'
# {"app":"search"}

k -n lupus get pods --show-labels
# search-stable-...   app=search,track=stable,pod-template-hash=...
```

The selector names `app` and says nothing about `track`. So anything in
this Namespace carrying `app=search` joins the same endpoint list, and
the canary is just a second Deployment that wears that label.

Write it:

```yaml
# canary.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: search-canary
  namespace: lupus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: search
      track: canary
  template:
    metadata:
      labels:
        app: search
        track: canary
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports:
            - containerPort: 80
```

```bash
k -n lupus apply -f canary.yaml
k -n lupus scale deploy/search-stable --replicas=4
k -n lupus rollout status deploy/search-canary
```

Five endpoints, one of them the new version:

```bash
k -n lupus get endpointslice -l kubernetes.io/service-name=search
k -n lupus get pods -l app=search --show-labels
k -n lupus get pods -l app=search,track=canary
```

## Why the counts are the split

There is no weighting anywhere in a Service. The EndpointSlice
controller collects every ready Pod matching the selector into one flat
list, and kube-proxy picks from that list evenly. So the only lever is
how many Pods of each kind are in it:

```
canary share = canary ready Pods / all ready Pods behind the Service
```

One canary Pod out of five is 20%. That also fixes the granularity:
with five Pods the smallest step you can take is 20%, and 5% would need
twenty Pods. This is the honest limitation of replica-count canaries, and
the reason service meshes and Ingress controllers exist — they can weight
by request instead of by Pod, at the price of another component to run.

Scaling the stable Deployment down at the same time is what keeps
capacity constant. Adding a canary Pod on top of five would be a 6-Pod
Service serving one sixth to the canary, and quietly 20% more capacity
than the workload was sized for.

## Why both labels

`app: search` is what puts the Pod in the endpoint list.

`track: canary` does two things:

- It keeps the two Deployments' `spec.selector.matchLabels` **disjoint**.
  If the canary selected on `app: search` alone, its ReplicaSet would
  count the stable Pods as its own — two controllers fighting over one
  set of Pods, deleting each other's, forever. `selector` is immutable
  after creation, so the recovery is deleting the Deployment.
- It gives you a handle on each version:
  `kubectl -n lupus get pods -l app=search,track=canary`, and
  `kubectl -n lupus logs -l track=canary` when you go looking for the
  errors the trial is meant to surface.

## Reading the result

Do not try to prove the split by sending ten requests and counting. The
selection is per connection and unweighted, so ten requests to a 1-in-5
split land two canary hits *on average* and quite often none — you would
be measuring a random variable, not a configuration. What you can read
directly is the endpoint list and the replica counts, which is what the
split actually is.

## Rolling it out or rolling it back

Promotion is `kubectl -n lupus scale` in a loop: canary up, stable down,
one step at a time, watching the canary's logs at each step. Rollback is
one command — `kubectl -n lupus scale deploy/search-canary --replicas=0`
— and it takes effect as fast as the endpoint list is rebuilt.

Compare that with blue/green, where the whole of the traffic moves the
instant the Service's selector moves. Blue/green trades exposure for
speed: nobody is ever served a mixture, and nobody trials the new version
on 20% of users first either.
