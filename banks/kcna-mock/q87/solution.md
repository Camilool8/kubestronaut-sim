**A Secret is intended for sensitive data and is base64-encoded (not encrypted by default) with access typically restricted further by RBAC, while a ConfigMap is for non-sensitive configuration stored in plain text** is correct: both objects share the same basic shape — key/value data a Pod can consume as environment variables or mounted files — but Secrets exist as a distinct type specifically so tooling, RBAC policy, and cluster add-ons (like at-rest encryption providers) can treat sensitive values differently from ordinary configuration.

Why the others are wrong:

- **A ConfigMap can only be consumed as environment variables, while a Secret can only be mounted as a file** — both object types support being consumed either way (environment variables or a mounted volume); the choice is up to the Pod spec, not a restriction of the object type itself.
- **A Secret is cluster-scoped, while a ConfigMap is Namespace-scoped** — both ConfigMaps and Secrets are Namespace-scoped objects; neither exists at the cluster level.
- **A ConfigMap requires a running Pod to create, while a Secret can be created independently** — both are ordinary API objects that can be created independently of any Pod, at any time, exactly the same way.
