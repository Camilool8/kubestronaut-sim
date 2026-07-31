**Namespaces** is correct: namespaces divide one physical cluster into multiple virtual scopes. Resource names only need to be unique within a namespace, so team A's `web` Deployment in namespace `team-a` and team B's `web` Deployment in namespace `team-b` coexist without conflict. Namespaces are the standard way to separate teams, projects, or environments sharing a cluster.

Why the others are wrong:

- **Labels** — labels group and identify objects for selection, but they do not create separate naming scopes; two Deployments with the same name in the same namespace would still collide no matter how they are labeled.
- **Resource quotas** — a ResourceQuota limits how much CPU, memory, or object count a namespace may consume; it depends on namespaces rather than providing the name isolation itself.
- **Annotations** — annotations attach non-identifying metadata to objects; they have no effect on naming or scoping.
