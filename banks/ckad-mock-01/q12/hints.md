## Hint 1

The revision number and the history are both from the same command
family. Record the revision *before* you change anything — after the
rollout there is a new one.

"Record the reason so it shows up in history" is a specific annotation,
and `--record` is deprecated.

## Hint 2

`kubectl -n draco rollout history deploy/payments-api` shows revisions;
the current one is also in
`.metadata.annotations.deployment\.kubernetes\.io/revision`.

The change cause is the annotation
`kubernetes.io/change-cause` — set it with `kubectl annotate`.

Roll back with `kubectl rollout undo`, optionally `--to-revision=`.
Note the scale to 4 must survive the rollback, so check it afterwards.
