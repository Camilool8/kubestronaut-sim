# Solution 30

**Look before you grant.** The question says something already grants
this identity too much, and `can-i --list` is how you see it:

```bash
k auth can-i --list -n crater \
  --as=system:serviceaccount:crater:report-reader
```

```
Resources        Non-Resource URLs   Resource Names   Verbs
configmaps       []                  []               [create delete deletecollection get list patch update watch]
deployments.apps []                  []               [create delete deletecollection get list patch update watch]
...
```

That is the built-in `edit` ClusterRole. Find what attaches it:

```bash
k get clusterrolebinding -o json \
  | jq -r '.items[] | select(.subjects[]? | .name == "report-reader") | .metadata.name'
# report-reader-legacy
```

**1-3. Build the narrow grant.** All three objects have generators, so
none of this is typed by hand:

```bash
k -n crater create serviceaccount report-reader

k -n crater create role configmap-reader \
  --verb=get --verb=list --verb=watch --resource=configmaps

k -n crater create rolebinding report-reader-binding \
  --role=configmap-reader --serviceaccount=crater:report-reader
```

`--serviceaccount` wants `<namespace>:<name>`, because a subject is
identified by both — a RoleBinding in one Namespace may perfectly well
name a ServiceAccount from another.

Check what the Role says:

```bash
k -n crater get role configmap-reader -o jsonpath='{.rules}'
# [{"apiGroups":[""],"resources":["configmaps"],"verbs":["get","list","watch"]}]
```

The empty string in `apiGroups` is the **core** group, which is where
ConfigMaps, Secrets, Pods and Services live. It is easy to read as a
mistake; it is not.

**4. Remove the leftover:**

```bash
k delete clusterrolebinding report-reader-legacy
```

Now verify each half, including the ones that must fail:

```bash
sa=--as=system:serviceaccount:crater:report-reader
k auth can-i list configmaps  -n crater         $sa    # yes
k auth can-i get  configmaps  -n crater         $sa    # yes
k auth can-i delete configmaps -n crater        $sa    # no
k auth can-i get  configmaps  -n crater-archive $sa    # no
k auth can-i get  secrets     -n crater         $sa    # no
```

## Why the Namespace half comes for free

A Role is namespaced, and a RoleBinding grants its Role's rules **only
inside the RoleBinding's own Namespace**. Nothing about the Role
mentions `crater-archive`, so nothing needed to deny it: RBAC is purely
additive and has no deny rule at all. Anything not granted is refused.

That is also why task 4 exists. Adding a correct narrow Role does not
undo a wide one — the union of every binding that names the subject is
what applies, so the only way to reduce access is to take a grant away.

The four combinations are worth being able to name on sight:

| | Role | ClusterRole |
|---|---|---|
| **RoleBinding** | rules apply in the binding's Namespace | the ClusterRole's rules, narrowed to the binding's Namespace |
| **ClusterRoleBinding** | not legal | rules apply cluster-wide |

The second cell is the useful one and the least known: it is how the
built-in `view` and `edit` ClusterRoles are meant to be handed out, one
Namespace at a time, without redefining them.

## can-i, and what it is really asking

```bash
k auth can-i <verb> <resource> -n <ns> --as=<user>
```

`--as` turns a "can I" into a SubjectAccessReview about somebody else,
which is the fastest way to test a grant without holding a token for it.
A ServiceAccount's user name is always
`system:serviceaccount:<namespace>:<name>` — that string, not the object,
is what RBAC matches on, which is why the binding this question asks you
to delete worked before the ServiceAccount existed.

`--list` is the same idea widened: every rule that resolves for that
subject in that Namespace. Reach for it before writing a Role, not only
when something is denied.
