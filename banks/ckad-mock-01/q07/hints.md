## Hint 1

Some of these five belong to the Pod and some to the container, and
one of them is deliberately at whichever level you choose. Look at
`kubectl explain pod.spec.securityContext` next to
`kubectl explain pod.spec.containers.securityContext` — they are not the
same list.

"Refuse to start it if the image would run as root" is a field, not a
consequence of setting the user id.

## Hint 2

`runAsUser`, `runAsGroup` and `runAsNonRoot` can sit at either level.
`allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true` and
`capabilities.drop: ["ALL"]` are container-level only.

Resources go under `resources.requests` and `resources.limits`.

If the Pod will not start, `kubectl -n cygnus describe pod vault-agent`
names which constraint it violated.
