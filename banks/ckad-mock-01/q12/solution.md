# Solution 12

**1. Record where you started.** The current revision lives in an
annotation on the Deployment:

```bash
k -n draco get deploy payments-api \
  -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' \
  > /opt/course/12/revision-before
cat /opt/course/12/revision-before   # 1
```

Note the escaped dots — `deployment.kubernetes.io/revision` is a single
key containing dots, and unescaped they would be read as nesting.

**2. Upgrade, with a reason.** `--record` is gone in modern kubectl; the
change cause is an annotation you set yourself:

```bash
k -n draco set image deploy/payments-api api=nginx:1.29-alpine
k -n draco annotate deploy/payments-api \
  kubernetes.io/change-cause="upgrade to nginx 1.29" --overwrite
k -n draco rollout status deploy/payments-api
```

Order matters more than it looks. The annotation is copied onto the
ReplicaSet when a rollout creates one, so annotating *after* `set image`
still lands on the new revision — but annotating long after, once things
have settled, is a habit that eventually annotates the wrong one. Setting
both in a single `k edit` is the tidier version.

**3. Scale:**

```bash
k -n draco scale deploy/payments-api --replicas=4
k -n draco rollout status deploy/payments-api
```

**4. Roll back.** Look at the history first, then undo:

```bash
k -n draco rollout history deploy/payments-api
# REVISION  CHANGE-CAUSE
# 1         initial deployment
# 2         upgrade to nginx 1.29

k -n draco rollout undo deploy/payments-api
k -n draco rollout status deploy/payments-api
```

`rollout undo` with no arguments goes to the previous revision. To pick a
specific one: `k -n draco rollout undo deploy/payments-api --to-revision=1`.

Confirm the image came back **and** the replica count survived:

```bash
k -n draco get deploy payments-api \
  -o custom-columns=IMAGE:.spec.template.spec.containers[0].image,REPLICAS:.spec.replicas
# IMAGE               REPLICAS
# nginx:1.27-alpine   4
```

That is the part worth noticing: a rollback restores the **Pod template**
— image, env, probes — and not the replica count, because scaling is not
part of a revision. Roll back expecting to undo a scale-up and you will
be surprised.

**5. Save the history:**

```bash
k -n draco rollout history deploy/payments-api > /opt/course/12/history
cat /opt/course/12/history
```

## Rolling back creates a new revision

After the undo, the history reads:

```
REVISION  CHANGE-CAUSE
2         upgrade to nginx 1.29
3         initial deployment
```

Revision 1 is *gone* and revision 3 is its content, re-applied. Undoing
does not rewind the counter; it rolls a new revision forward whose
template happens to match an old one. That is why the check requires at
least three revisions — reaching `nginx:1.27-alpine` by editing the image
back would leave two, and would not be a rollback.
