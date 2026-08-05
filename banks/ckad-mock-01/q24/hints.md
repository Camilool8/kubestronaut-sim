## Hint 1

You do not have to write the Pod spec again. The running Pod already has
one, and a Deployment's `spec.template.spec` is exactly that spec one
level down — export it and rebuild around it rather than retyping.

For the hardening, note that the five requirements are not all fields of
the same object. Two of them exist in only one of the two places
`securityContext` can appear.

## Hint 2

`kubectl create deploy --image` gets you a skeleton fast, but it will not
give you the container name or the command. `kubectl -n auriga get pod
report-runner -o json` gives you both, and `--dry-run=client -o yaml`
turns the skeleton into something you can paste them into.

`runAsUser`, `runAsNonRoot` and `seccompProfile` are legal on either
securityContext. `allowPrivilegeEscalation` and `capabilities` are
container-level only.

The seccomp field is a small object with a `type`, not a string.
`kubectl explain pod.spec.containers.securityContext.seccompProfile`
spells it out.
