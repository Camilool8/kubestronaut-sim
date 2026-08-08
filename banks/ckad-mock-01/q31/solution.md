# Solution 31

Look at what is there before pausing anything, so the ReplicaSet count in
step 3 means something:

```bash
k -n pyxis get deploy,rs
# deployment.apps/feed-api   3/3   3   3
# replicaset.apps/feed-api-6c8d9f7b45   3   3   3
```

One ReplicaSet, because the Deployment has only ever had one Pod
template.

**1. Pause:**

```bash
k -n pyxis rollout pause deploy/feed-api
```

**2. Change the image while it is paused:**

```bash
k -n pyxis set image deploy/feed-api api=nginx:1.29-alpine
```

Nothing happens, and that is the point. No Pod is deleted, no Pod is
created, and `kubectl get pods` shows the same three names as before.

**3. Count the ReplicaSets and record it:**

```bash
k -n pyxis get rs --no-headers | wc -l
# 1

echo 1 > /opt/course/31/replicasets-while-paused
```

Still one. The new Pod template is sitting in `spec.template` with
nothing acting on it.

**4. Resume, and watch the rollout you deferred happen all at once:**

```bash
k -n pyxis rollout resume deploy/feed-api
k -n pyxis rollout status deploy/feed-api
# deployment "feed-api" successfully rolled out

k -n pyxis get rs
# feed-api-6c8d9f7b45   0   0   0
# feed-api-79bb5c4f8c   3   3   3
```

Two now: the old one scaled to zero and kept for a rollback, and the new
one carrying the Pods.

## What pausing actually stops

`spec.paused: true` stops the Deployment **controller**, not the API
server. Writes to the Deployment still succeed — the image edit is
accepted and stored exactly as it would be otherwise — but the controller
declines to reconcile, so it never creates the ReplicaSet that the new
Pod template calls for.

That gap is the feature. Every field you touch while paused accumulates
into one rollout:

```bash
k -n pyxis rollout pause deploy/feed-api
k -n pyxis set image deploy/feed-api api=nginx:1.29-alpine
k -n pyxis set resources deploy/feed-api -c api --limits=memory=256Mi
k -n pyxis rollout resume deploy/feed-api      # one rollout, one new ReplicaSet
```

Without the pause, that is two rollouts and two new ReplicaSets, and the
first one's Pods are torn down half-started by the second.

## Things a paused Deployment will not do

- **It will not roll back.** `kubectl rollout undo` on a paused
  Deployment is refused outright.
- **It will not report progress.** `rollout status` blocks and then times
  out, because there is no rollout to have a status.
- **It still scales.** `spec.replicas` is handled by the ReplicaSet, and
  the current ReplicaSet is not paused, so `kubectl scale` works
  normally. Only the *template* change is held back.

## Resuming, and the field underneath

```bash
k -n pyxis get deploy feed-api -o jsonpath='{.spec.paused}'
```

After a resume this prints nothing, because `paused` is a boolean with
`omitempty` and `kubectl rollout resume` removes it rather than writing
`false`. Empty and `false` mean the same thing to the controller; `true`
is the only value that stops it.

Leaving a Deployment paused is a quiet way to lose an afternoon. Every
subsequent change is accepted and none of it reaches a Pod, so the
cluster disagrees with the manifest and nothing anywhere reports an
error.
