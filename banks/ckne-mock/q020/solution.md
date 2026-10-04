**The Gateway's listeners.allowedRoutes.namespaces field** is correct: By default, `allowedRoutes.namespaces.from` is `Same`. To accept routes from other namespaces, use `from: All` or `from: Selector` on the listener. For backends in other namespaces you also need a `ReferenceGrant`.

Why the others are wrong:

- **The backend Service must be NodePort** — a route's backend is reached by the gateway data plane inside the cluster; the Service type is irrelevant, and ClusterIP is the norm.
- **HTTPRoutes only work in the Gateway's namespace, no exceptions** — cross-namespace routes are a first-class case — the listener's `allowedRoutes.namespaces.from` can be `All` or a label `Selector`.
- **The HTTPRoute needs hostNetwork** — hostNetwork is a pod setting; an HTTPRoute is a routing object with no pods of its own.
