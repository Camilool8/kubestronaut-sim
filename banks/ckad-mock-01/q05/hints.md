## Hint 1

A native sidecar is not a second entry under `containers`. It is an
init container with one extra field — that field is what makes Kubernetes
start it before the main container and restart it independently.

The init container must *not* mount the volume, which is a thing you
have to not do rather than do.

## Hint 2

Declare `shipper` under `initContainers` with `restartPolicy: Always`.
That single field is the whole native-sidecar mechanism.

Order matters inside `initContainers`: `wait-for-source` must come first,
because it has to finish before `shipper` starts.

`kubectl -n lyra logs deploy/feed-writer -c shipper` gets you the output
for the file.
