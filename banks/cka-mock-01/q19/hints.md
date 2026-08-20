## Hint 1

Three separate edits land in one Pod template, and it is worth being clear
which is which before you start typing: a volume, two mounts, and a
container.

The volume is declared once, under `spec.template.spec.volumes`. Mounts
are per container — the one that writes needs its own entry just as much
as the one that reads, and a directory that is not mounted over is simply
part of that container's private filesystem.

The new container does not go where you might reflexively put it. Look at
what `kubectl explain deploy.spec.template.spec.initContainers` lists as
its fields and ask yourself why an *init* container would need a restart
policy of its own at all.

## Hint 2

`initContainers` is the right list, and the entry needs
`restartPolicy: Always` on it. Leave that field off and the kubelet waits
for the entry to finish before starting anything else, which a command
built around `tail -F` will never do — the Pod stays in `Init` and you
will see it immediately.

If the sidecar starts and its log stays empty, the mounts are the place to
look, not the command. `tail -F` keeps retrying a file that is not there
rather than exiting, so the container is `Running` and healthy while it
watches an empty directory. Compare the `volumeMounts` on both containers:
same volume name, same `mountPath`, or nothing is shared.

Check what you have with

```bash
k -n volans get deploy orders-api -o jsonpath='{.spec.template.spec.volumes}'
```
