## Hint 1

Two things have to be true at the end, and one command does both: it marks the
node closed *and* asks every Pod on it to leave. `kubectl cordon` is only the
first half — it changes where the scheduler puts new Pods and moves nothing
that is already running.

Expect the command to refuse the first time. It stops rather than guessing
about Pods it cannot move on its own, and the error names every one of them
and the flag that covers it. Read it instead of reaching for `delete pod`.

## Hint 2

`kubectl drain --help`. Two of its flags matter here, and the error tells you
which:

- the system Pods on every node belong to DaemonSets, which would recreate
  them on this node immediately, so drain will not touch them until you say
  it may ignore them;
- the collector writes to an `emptyDir`, which lives on this node's disk and
  dies with the Pod, so drain will not delete that data without permission.

Afterwards, `k -n aquila get pod -o wide` shows two `Pending` Pods and
`describe` says no node is available. Nothing is broken: they are pinned by
`kubernetes.io/hostname` to the node you just closed. Leave them there —
un-pinning the Deployment or uncordoning the node undoes the very thing you
were asked to arrange.
