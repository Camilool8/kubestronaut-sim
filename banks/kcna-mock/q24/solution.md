**A new resource type is added to the Kubernetes API, so users can create custom objects with kubectl** is correct: a CRD extends the API server with a new kind under its own API group, and the server immediately starts serving CRUD endpoints for it. Users can then `kubectl get`, `create`, and `delete` objects of the new kind like any built-in resource. Typically an operator — a custom controller — watches those objects and acts on them, since the CRD alone only stores data.

Why the others are wrong:

- **A new controller binary is installed onto every node** — a CRD is purely an API schema declaration; any controller or operator that reacts to the custom objects has to be deployed separately, usually as a Deployment.
- **An existing built-in API resource is replaced with a custom implementation** — CRDs add new resource types alongside the built-in ones; they cannot override or replace core resources such as Pods or Services.
- **A ServiceAccount is granted permission to manage cluster resources** — permissions are granted through RBAC objects like Roles and RoleBindings; creating a CRD changes the API surface, not anyone's authorization.
