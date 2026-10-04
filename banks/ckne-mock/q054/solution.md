**Chaining: plugins run in sequence** is correct: CNI chaining executes plugins in order: the first (main) creates and configures the interface; chained ones receive the previous result (prevResult) and add capabilities like `portmap` (hostPort) and `bandwidth` (kubernetes.io/ingress-bandwidth annotations).

Why the others are wrong:

- **Choosing the plugin based on the pod's namespace** — a conflist is node-local configuration selected by name; it has no view of Kubernetes namespaces and cannot branch on them.
- **Running each plugin on a different node** — the file is read on the node where it sits and every entry runs there, for every pod — nothing in the spec distributes plugins across nodes.
- **Defining alternative plugins, used only if the first one fails** — CNI has no failover semantics: if any plugin in the chain returns an error, the whole ADD fails and the pod stays in ContainerCreating.
