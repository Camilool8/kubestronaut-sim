## Hint 1

Three objects, and they do different jobs: one is an identity, one
enumerates what may be done, the third says who may do it. Each has a
namespaced form and a cluster-scoped form, and choosing the namespaced
ones is what makes the `kube-system` half of the requirement true
without writing anything about `kube-system`.

The third grant is not a verb on a resource you already have. Ask
`kubectl api-resources` what a Deployment's replica count is actually
changed through, and notice that the answer has a `/` in its name.

## Hint 2

A rule grants the cross product of its `apiGroups`, `resources` and
`verbs`, so one rule cannot carry three grants that differ in all three
of those. Count how many rules the table in the question needs before
you write any of them.

Pods are in the core API group, written as `""`. Deployments are not —
they are in `apps`, and so is the subresource. `kubectl create role
--dry-run=client -o yaml` is still worth running for a skeleton to edit,
but read what it gives you before you apply it: it hands every verb you
passed to every resource in the group.

For the binding, `kubectl create rolebinding` takes `--role` and
`--serviceaccount`, and the latter wants `<namespace>:<name>` rather
than a bare name.
