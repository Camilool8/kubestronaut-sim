**namespaceSelector: {} (empty) matches ALL namespaces in the cluster** is correct: In Kubernetes selectors, empty = select everything. `namespaceSelector: {}` opens to the whole cluster — the opposite of the "empty = nothing" intuition. One of the most-tested traps.

Why the others are wrong:

- **The empty selector matches no namespace (empty set)** — in Kubernetes selectors an empty selector selects everything; `{}` never means the empty set.
- **The empty selector is invalid syntax rejected at admission** — `{}` is valid and accepted; that is what makes it dangerous.
- **No difference** — omitting the field restricts the peer to the policy's own namespace; including it empty opens the peer to every namespace.
