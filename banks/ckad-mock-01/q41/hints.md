## Hint 1

`Pending` is not an error state — it is the scheduler saying it has not
found anywhere to put the Pod yet. Nothing in the container logs will
tell you why, because no container was ever created. The reason is in
the Pod's events instead.

Every object carries its recent events, and there are two ways to reach
them: the bottom of `kubectl describe`, or `kubectl get events` filtered
down to the object you care about.

## Hint 2

Compare what the Pod asks for against what a node has. `requests` is what
the scheduler does arithmetic with; `limits` it ignores entirely.

For step 3, remember that `spec.containers[].resources` is fixed once the
Pod exists. Save the Pod to a file, edit the request there, delete the
Pod and apply the file — `kubectl get pod ... -o yaml` is the quickest
way to get a starting manifest, and `--force` on `replace` will do the
delete for you.
