## Hint 1

"Headless" is one field on an otherwise ordinary Service, and setting it
changes what DNS answers rather than what the Service does. Nothing is
load balanced and no virtual address is allocated: the name resolves
straight to the Pods behind it.

That is also what gives the members of a StatefulSet their individual
names. An ordinary Service publishes only its own name, however carefully
its Pods are numbered.

## Hint 2

The field is `spec.clusterIP`, and the value is the string `None` rather
than an empty one. `kubectl create service clusterip --clusterip=None`
writes it, or `kubectl expose --cluster-ip=None`; either way check the
selector afterwards, since `expose` copies it from whatever you exposed.

The file wants one name per Pod, not one address: a Pod's own name is
`<pod>.<service>.<namespace>.svc.cluster.local`. Which Pods the Service
publishes is on the EndpointSlice it owns, one `targetRef` per endpoint:

```bash
k -n telescopium get endpointslice -l kubernetes.io/service-name=shard
```
