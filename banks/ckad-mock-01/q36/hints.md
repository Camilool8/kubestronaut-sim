## Hint 1

This Service has no selector and no endpoints, and it never carries
traffic. It exists only so that a name inside one Namespace becomes an
alias for a name somewhere else, which the cluster's DNS then answers
with a CNAME record.

Look at the Service types you know and pick the one that stores a name
rather than a set of Pods.

## Hint 2

`spec.type` and `spec.externalName` are the only two fields that matter,
and `kubectl create service externalname` writes both for you.

The alias has to be the target's full DNS name, all four labels of it —
a short form such as `catalog.mensa` is not inside the cluster's DNS
zone, so the resolver treats it as an outside name and gives up.
