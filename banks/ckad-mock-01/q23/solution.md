# Solution 23

Both releases are already running. The only thing that decides which one
receives traffic is the Service's label selector, so the whole cutover is
one field.

```bash
k -n lacerta get pods --show-labels
# checkout-blue-...   app=checkout,release=blue
# checkout-green-...  app=checkout,release=green
```

Move the selector onto green:

```bash
k -n lacerta patch svc checkout --type=merge \
  -p '{"spec":{"selector":{"app":"checkout","release":"green"}}}'
```

Confirm it from a client, not from the YAML:

```bash
k -n lacerta exec deploy/checkout-client -- wget -q -O - http://checkout
# checkout release green
```

## Why the selector and nothing else

A Service does not know that `checkout-blue` and `checkout-green` exist.
It holds a set of labels, the EndpointSlice controller keeps a list of
every Pod in the Namespace carrying them, and kube-proxy programmes the
node's forwarding rules from that list. Change the labels and the list is
rebuilt within a second or so — no Pod restarts, no image is pulled, and
no connection that is already open is disturbed.

That is the entire appeal of blue/green over a rolling update: the new
version is already built, already scheduled, already warm and already
answering health checks before a single user reaches it. The switch is
atomic from the caller's point of view, and so is the rollback.

## The merge-patch trap

`--type=merge` merges maps key by key. This does **not** do what it looks
like:

```bash
# WRONG: leaves release=blue in place alongside app=checkout
k -n lacerta patch svc checkout --type=merge -p '{"spec":{"selector":{"app":"checkout"}}}'
```

and this quietly selects *both* releases:

```bash
# WRONG: a selector matching both means traffic is split across versions
selector:
  app: checkout
```

A selector that matches too much does not error. It load-balances across
two versions of your application, which is the failure you find out about
from support tickets rather than from `kubectl`. Read the selector back
after patching.

## Rolling back

Because blue was left running at full strength, the rollback is the same
command with one word changed:

```bash
k -n lacerta patch svc checkout --type=merge \
  -p '{"spec":{"selector":{"app":"checkout","release":"blue"}}}'
```

This is why the question forbids scaling blue down. `replicas: 0` looks
tidy and costs nothing until you need it, at which point the rollback has
to schedule Pods, pull an image and wait for readiness — the minutes you
adopted blue/green to avoid.

## Where canary differs

A canary shares the same mechanism from the other end: instead of moving
the selector, you give both Deployments the *same* selectable label and
let the replica counts decide the split — nine blue Pods and one green
Pod sends roughly a tenth of the traffic to green. It is the same
Service, the same EndpointSlice and the same kube-proxy; only the
proportion is different.
