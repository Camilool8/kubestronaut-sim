**kubectl config use-context prod** is correct: a context ties together a cluster, a user, and optionally a default namespace, and `use-context` sets which context is current in the kubeconfig. After running it, every subsequent kubectl command targets the `prod` cluster with the `prod` context's credentials until you switch again.

Why the others are wrong:

- **kubectl config set-cluster prod** — this creates or modifies a cluster entry (server URL, CA data) inside the kubeconfig; it does not change which context kubectl currently uses.
- **kubectl config set-context prod** — this creates or updates the definition of a context (its cluster/user/namespace fields) but does not make it the active one; only `use-context` switches.
- **kubectl config view** — this only prints the merged kubeconfig contents for inspection and never changes the current context.
