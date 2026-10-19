**namespaceSelector with the kubernetes.io/metadata.name label** is correct: Every namespace automatically gets the immutable label `kubernetes.io/metadata.name`. Using it in the namespaceSelector lets you reference namespaces by name without relying on manual labels.

Why the others are wrong:

- **ipBlock with the namespace CIDR** — namespaces have no CIDR; pod addresses are allocated per node, not per namespace, so no IP block corresponds to one.
- **Writing the literal name into a from.namespace field** — `from` peers accept `podSelector`, `namespaceSelector` and `ipBlock`; there is no `namespace` name field.
- **It's not possible to select by name** — the automatic `kubernetes.io/metadata.name` label exists precisely to make selection by name possible.
