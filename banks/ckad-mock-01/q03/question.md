# Question 3 | NetworkPolicy lockdown

*Solve this question on instance: `ssh instance-2`*

Namespace `orbit` runs Deployments `frontend` (`role=frontend`), `api`
(`role=api`) and `metrics` (`role=metrics`).

Create a NetworkPolicy named `api-guard` in Namespace `orbit`:

1. It must select the `role=api` Pods.
2. Ingress: allow **only** Pods labeled `role=frontend` from the same
   Namespace, and only on TCP port `80`.
3. Egress: allow **only** DNS (UDP and TCP port `53`).
4. Everything else to/from the `api` Pods must be denied.
