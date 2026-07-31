**kubectl apply creates the resource if it does not exist and updates it to match the manifest on later runs** is correct: `apply` is the declarative command — you can run it repeatedly with an edited manifest and Kubernetes reconciles the live object toward it. `kubectl create` is imperative: it makes the object once and returns an `AlreadyExists` error if you run it again for the same resource.

Why the others are wrong:

- **kubectl create updates existing resources in place, while kubectl apply only works on new resources** — this is backwards: `create` fails on existing objects, and `apply` is precisely the command that handles both creation and subsequent updates.
- **kubectl apply deletes and recreates the resource on every run** — `apply` patches the existing object to match the manifest; it does not delete it, so things like a Service's ClusterIP or existing Pods are not needlessly destroyed.
- **kubectl create is required for resources defined in YAML files; apply only works with flags** — both commands accept `-f` with YAML or JSON manifests; neither is restricted to flag-based generators.
