## Hint 1

`kubectl explain limitrange.spec.limits` lists several maps under one
entry. Two of them fill in what a container left out; the others are
ceilings and floors, which is a different guarantee and not what is
asked for here.

The order you create things in matters for task 2. Admission happens
once, when the Pod is accepted.

## Hint 2

The entry is keyed `type: Container`. `defaultRequest` supplies the
missing request and `default` supplies the missing limit — the shorter
name is the one people expect to mean "request", and it does not.

There is no generator for a LimitRange, so write the manifest.

Once the Pod exists, ask the Pod rather than the LimitRange what it got:
`kubectl -n fornax get pod unspecified -o jsonpath` down to the
container's `resources`.
