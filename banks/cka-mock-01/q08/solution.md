# Solution 8

**1. The identity.** One command, and it is the only object here with a
generator worth using:

```bash
k -n pavo create serviceaccount ci-bot
```

**2. The Role.** This is where the question is won or lost, and the
generator is a trap rather than a shortcut. `kubectl create role` splits
its resources into **one rule per API group** and then gives every rule
**all** of the verbs — and a rule grants the cross product of its
apiGroups, resources and verbs:

```bash
k -n pavo create role ci-deployer --dry-run=client -o yaml \
  --verb=get,list,watch,create,update \
  --resource=pods,deployments.apps,deployments.apps/scale
```

```yaml
rules:
- apiGroups:
  - ""
  resources:
  - pods
  verbs:
  - get
  - list
  - watch
  - create
  - update
- apiGroups:
  - apps
  resources:
  - deployments
  - deployments/scale
  verbs:
  - get
  - list
  - watch
  - create
  - update
```

That is fifteen grants where five were asked for. Among the ten extra
are `create` and `update` on `pods` and `update` on whole `deployments`
— exactly the access this question exists to withhold. The verb list
cannot be varied per resource from the command line, so grants that
differ in group, resource **and** verb need one rule each:

```bash
k apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ci-deployer
  namespace: pavo
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["create"]
  - apiGroups: ["apps"]
    resources: ["deployments/scale"]
    verbs: ["update"]
EOF
```

The empty string in the first rule's `apiGroups` is the **core** group,
where Pods live. Deployments are not there — they are in `apps` — and
that pair of facts is worth being able to recite, because a rule that
names the wrong group is silently a rule that grants nothing.

**3. The binding.** Here the generator is exactly right:

```bash
k -n pavo create rolebinding ci-bot-deployer \
  --role=ci-deployer --serviceaccount=pavo:ci-bot
```

`--serviceaccount` wants `<namespace>:<name>`, because a subject is
identified by both: a RoleBinding in one Namespace may perfectly well
name a ServiceAccount from another.

Then verify both halves, the denials included:

```bash
sa=--as=system:serviceaccount:pavo:ci-bot
k auth can-i list   pods        -n pavo        $sa   # yes
k auth can-i create deployments -n pavo        $sa   # yes
k auth can-i update deployments -n pavo --subresource=scale $sa   # yes
k auth can-i delete pods        -n pavo        $sa   # no
k auth can-i update deployments -n pavo        $sa   # no
k auth can-i list   pods        -n kube-system $sa   # no
```

## The scale subresource

`deployments/scale` is not a spelling of `deployments`. It is a separate
endpoint on the same object — a tiny `Scale` document holding a replica
count — with its own line in RBAC:

| Grant | What it permits |
|---|---|
| `update` on `deployments` | rewriting the whole object: image, command, args, replicas, everything |
| `update` on `deployments/scale` | changing the replica count, and nothing else |

`kubectl scale` goes through the second. So does an HPA, which is why
this pattern shows up wherever something is allowed to size a workload
without being allowed to redefine it — and it is the correct answer to
"the pipeline needs to scale things" almost every time.

Two subresources worth knowing beside it: `pods/log`, which is why a
reader that can `get pods` still cannot read logs, and `pods/exec`,
which is the grant that decides whether somebody can open a shell in a
container.

### `--subresource`, and the trap in the obvious spelling

The subresource is a **flag**. `can-i`'s positional form is
`VERB TYPE [NAME]`, so

```bash
k auth can-i update deployments/scale -n pavo $sa   # no
```

does not ask what it looks like it asks: the slash makes `scale` a
resource *name*, and the question becomes "may this account update the
Deployment called scale", which nothing grants. There is no error and no
warning — a correct Role answers `no` and it is not obvious why. The tell
is that `can-i --list` shows the grant while the query denies it:

```
deployments.apps/scale   []   []   [update]
```

## can-i, and asking it about somebody else

```bash
k auth can-i <verb> <resource> -n <ns> --as=<user>
```

`--as` turns "can I" into a SubjectAccessReview about another subject,
which is the fastest way to test a grant without holding a token for it.
A ServiceAccount's user name is always
`system:serviceaccount:<namespace>:<name>` — that **string** is what RBAC
matches, not the object, so `can-i` will happily answer about an account
that does not exist.

`--list` is the same idea widened to every rule that resolves for a
subject in a Namespace:

```bash
k auth can-i --list -n pavo --as=system:serviceaccount:pavo:ci-bot
```

```
Resources                Non-Resource URLs   Resource Names   Verbs
pods                     []                  []               [get list watch]
deployments.apps         []                  []               [create]
deployments.apps/scale   []                  []               [update]
selfsubjectreviews...    []                  []               [create]
                         [/healthz]          []               [get]
```

The last rows are on every identity in the cluster: impersonating a
ServiceAccount also puts you in `system:authenticated`, which carries the
built-in self-review and discovery rules. Read past them — the three at
the top are the ones this question is about.

Reach for it before writing a Role, not only when something is denied.
And remember what it means when a denial you expected comes back `yes`:
RBAC has no deny rule, so nothing you add will ever narrow an existing
grant. The union of every binding that names the subject is what applies,
and the only way down is to take one away.
