## Hint 1

Pausing and resuming are both subcommands of the same `kubectl` verb —
the one you already use to watch and to undo a Deployment's rollouts.

Step 3 is the evidence that pausing did anything at all. A Deployment
creates a ReplicaSet per Pod template it has ever rolled out, so counting
them tells you whether the new template was acted on:

```bash
k -n pyxis get rs
```

## Hint 2

`kubectl -n pyxis rollout pause deploy/feed-api`, then the image edit,
then `kubectl -n pyxis rollout resume deploy/feed-api`.

The field behind those two commands is `spec.paused`, and resuming
removes it. Read it back before you decide you are finished:

```bash
k -n pyxis get deploy feed-api -o jsonpath='{.spec.paused}'
```

Order is the whole question. Edit the image before pausing and the
rollout is already gone.
