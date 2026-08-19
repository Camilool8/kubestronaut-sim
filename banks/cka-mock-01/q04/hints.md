## Hint 1

Ask two names from the same Pod: one in the internal zone and one under
`cluster.local`. Only one fails, which already rules out "DNS is down"
and points at the configuration of a single zone.

The shape of the failure is the second clue. A name that does not exist
comes back at once as NXDOMAIN; a nameserver that never replies makes
the client wait and then report a server failure.

Two servers sit on this path — the cluster's own, and the one that holds
the zone — so check both before deciding you are done.

## Hint 2

Cluster DNS reads everything from the ConfigMap `coredns` in
`kube-system`, key `Corefile`, where each zone is its own server block.
The plugin that hands a zone to another nameserver takes that
nameserver's **address**, so the value to write is what
`kubectl -n cygnus get svc sim-dns` prints under CLUSTER-IP.

Neither CoreDNS re-reads a ConfigMap the moment you save it, and the
Pods are what serve it: `kubectl rollout restart` on the Deployment,
then watch every replica come back ready.

When the name finally answers, compare the address it returns with
`kubectl -n cygnus get svc ledger`. If they differ, the remaining fault
is in the records the resolver itself serves — and those live in a
ConfigMap too.
