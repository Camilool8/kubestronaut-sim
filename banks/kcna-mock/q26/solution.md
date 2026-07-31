**A Role grants permissions within a single namespace, while a ClusterRole can cover cluster-scoped resources or be reused across namespaces** is correct: a Role is a namespaced object whose rules only apply inside that namespace. A ClusterRole is cluster-scoped: it can grant access to non-namespaced resources such as nodes, and via RoleBindings the same ClusterRole can be reused to grant identical permissions in many namespaces.

Why the others are wrong:

- **A Role applies only to human users, while a ClusterRole applies only to ServiceAccounts** — both kinds can be bound to any subject type (users, groups, or ServiceAccounts); the subject is chosen by the binding, not by the role kind.
- **A Role grants read-only permissions, while a ClusterRole grants read-write permissions** — the allowed verbs (get, list, create, delete, and so on) are defined in each rule; either kind can be read-only or read-write.
- **A Role is bound with a ClusterRoleBinding, while a ClusterRole is bound with a RoleBinding** — a Role is referenced by a RoleBinding in its own namespace; a ClusterRole can be referenced by either a ClusterRoleBinding (cluster-wide) or a RoleBinding (scoped to one namespace).
