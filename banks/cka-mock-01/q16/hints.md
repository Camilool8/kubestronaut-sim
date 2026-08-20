## Hint 1

Write the default first and then watch what it takes away. Policies never
deny anything individually: selecting a Pod with a policy that names a
direction is what makes that direction deny-by-default, and every policy
selecting that Pod then adds its allowances. There is no deny rule to write
and no ordering to reason about — the Pod permits the union.

So the shape of the answer is one policy that closes the Namespace and one
per allowance, rather than one clever policy that tries to say everything.

Two things to keep beside you while you work:

```bash
k -n hydra get pod --show-labels
k -n kube-system get pod -l k8s-app=kube-dns
```

The first is where the labels in your rules have to come from. The second
matters more than it looks: the moment you deny egress, name resolution is
denied with it, and a Pod that cannot resolve looks like a broken
application rather than a policy.

## Hint 2

The default is four lines and every one of them is easy to get subtly
wrong: an **empty** `podSelector` is the widest selector there is rather
than the narrowest, `policyTypes` has to name both directions, and the deny
itself is the absence of any rule. `ingress: []` says that too; `ingress:
[{}]` says the opposite.

In the two exceptions, `spec.podSelector` is the Pod being protected and
the selector under `from`/`to` is the other end. Getting those the wrong way
round is the classic swap, and it fails silently — a policy whose selector
matches nothing never applies, so the traffic you meant to deny flows
perfectly.

Both halves of a rule have to match: leave the `ports` list out and the
peer you carefully narrowed reaches every port on the destination, 9090
included.

For DNS, one `to` entry can carry a `namespaceSelector` **and** a
`podSelector` together, and the two are then ANDed into "these Pods in that
Namespace". Every Namespace carries the label
`kubernetes.io/metadata.name` automatically, which is how the first half is
written. Port 53 needs both UDP and TCP.

`kubectl explain networkpolicy.spec.egress.to` lists what a peer may hold if
you would rather not guess.
