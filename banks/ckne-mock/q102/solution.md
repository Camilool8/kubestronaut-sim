**No: NetworkPolicy is namespaced** is correct: The `spec.podSelector` selects targets ONLY in the policy's namespace. The `namespaceSelector` appears only in from/to rules (defining allowed sources/destinations), never to choose who gets isolated. For cluster scope, use AdminNetworkPolicy or CNI CRDs.

Why the others are wrong:

- **Only if the CNI is Calico** — the target scope of a NetworkPolicy is defined by the Kubernetes API, and no CNI extends it across namespaces.
- **Yes, with the cross-namespace annotation** — no such annotation exists in the core API.
- **Yes, if it uses namespaceSelector** — `namespaceSelector` only appears inside `from`/`to` peers to describe allowed sources or destinations; the pods being isolated always come from `spec.podSelector` in the policy's own namespace.
