Namespace `crater` runs a reporting job that reads its configuration
from ConfigMaps. It must be able to read those and nothing else: it may
not change or delete anything, and it must not see into Namespace
`crater-archive`.

An earlier attempt at this left a grant behind, and the identity it names
currently has far more access than the job needs.

1. Create a ServiceAccount named `report-reader` in Namespace `crater`.
2. Create a Role named `configmap-reader` in `crater` allowing exactly
   `get`, `list` and `watch` on `configmaps`, and nothing else.
3. Bind that Role to that ServiceAccount with a RoleBinding named
   `report-reader-binding` in `crater`.
4. Take away whatever else is still granting that ServiceAccount access
   beyond those three verbs.

When you are done, this must answer `yes`:

```bash
k auth can-i list configmaps -n crater \
  --as=system:serviceaccount:crater:report-reader
```

and the same question asked about `delete`, or asked in
`crater-archive`, must answer `no`.
