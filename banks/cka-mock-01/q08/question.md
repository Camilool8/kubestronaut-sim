The delivery pipeline that deploys into Namespace `pavo` currently runs
with an administrator's credentials. It is being given an identity of its
own, scoped to exactly what it does: it creates new Deployments, it
scales them, and it reads Pods to follow a rollout. It must never be able
to edit or delete anything that is already running, and it must see
nothing outside `pavo`.

Namespace `pavo` already runs a Deployment named `pipeline-web`.

1. Create a ServiceAccount named `ci-bot` in Namespace `pavo`.

2. Create a Role named `ci-deployer` in `pavo` that grants exactly the
   following and nothing else:

   | API group | Resource | Verbs |
   |---|---|---|
   | core | `pods` | `get`, `list`, `watch` |
   | `apps` | `deployments` | `create` |
   | `apps` | `deployments/scale` | `update` |

3. Bind `ci-deployer` to `ci-bot` with a RoleBinding named
   `ci-bot-deployer` in `pavo`.

When you are done, all three of these must answer `yes`:

```bash
sa=--as=system:serviceaccount:pavo:ci-bot
k auth can-i list   pods              -n pavo $sa
k auth can-i create deployments       -n pavo $sa
k auth can-i update deployments/scale -n pavo $sa
```

and all three of these must answer `no`:

```bash
k auth can-i delete pods        -n pavo        $sa
k auth can-i update deployments -n pavo        $sa
k auth can-i list   pods        -n kube-system $sa
```
