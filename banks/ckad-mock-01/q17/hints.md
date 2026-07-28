## Hint 1

Three workloads, and the two broken ones fail in ways that show up in
different places. One is visible in `kubectl get pods` restart counts;
the other never gets a Pod running at all, so look at events.

"Previous, already-dead run" is a flag on `kubectl logs`.

## Hint 2

`kubectl -n corvus get pods` — the restarting one has a climbing
`RESTARTS` column; the image-pull one sits in `ImagePullBackOff`.

`kubectl -n corvus logs <pod> --previous` gets the dead container's
output. Without `--previous` you get the current run, which may not
contain the message.

The bad image reference is in `kubectl -n corvus describe pod` events,
and also in the Deployment's own spec.
