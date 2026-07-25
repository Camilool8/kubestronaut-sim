# Question 1 | RBAC for a deployment bot

*Solve this question on instance: `ssh instance-1`*

The platform team runs a CI bot that must manage Deployments in the
`cka-rbac` Namespace (already created) — and nothing else.

1. Create a ServiceAccount `deploy-bot` in Namespace `cka-rbac`.
2. Create a Role `deployment-manager` in `cka-rbac` that allows exactly
   these verbs on `deployments` (apps API group): **get, list, watch,
   create, update, patch**.
3. Bind the Role to the ServiceAccount with a RoleBinding named
   `deploy-bot-binding` in the same Namespace.
4. Verify the bot can update Deployments and record the answer: save the
   output of the `kubectl auth can-i` check for that access to
   `/opt/course/1/can-update` on `instance-1` (the file must contain
   `yes`).
