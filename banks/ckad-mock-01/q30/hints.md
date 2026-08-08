## Hint 1

Two objects are involved and they do different jobs: one enumerates what
may be done, the other says who may do it. Both have a namespaced form
and a cluster-scoped form, and picking the namespaced one is what makes
the `crater-archive` half of the requirement true without any extra
work.

For task 4, ask the ServiceAccount itself what it can currently do —
`kubectl auth can-i` takes a flag that prints the whole list instead of
answering one question.

## Hint 2

`kubectl create role` takes repeated `--verb` and `--resource` flags;
`kubectl create rolebinding` takes `--role` and `--serviceaccount`, and
the latter wants `<namespace>:<name>` rather than a bare name.

The leftover grant is cluster-scoped, so nothing in
`kubectl -n crater get rolebinding` will show it. Look for one naming
this ServiceAccount among the cluster-scoped bindings instead — a
subject there carries its own `namespace` field.
