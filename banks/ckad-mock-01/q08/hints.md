## Hint 1

One Ingress, one host, two paths. The two rules differ only in
`path` and the Service they point at.

Order matters less than you would think — nginx matches the longest
prefix — but both rules do need `pathType`.

## Hint 2

Both paths take `pathType: Prefix`, and the class goes in
`spec.ingressClassName: nginx` (not the old annotation).

`kubectl create ingress` can generate the whole thing:
`--rule="helios.sim.local/*=storefront:80"` and a second `--rule` for
`/checkout*`.

Verify with the probe command in the question — if it answers
`storefront` for `/checkout`, your prefix is not matching.
