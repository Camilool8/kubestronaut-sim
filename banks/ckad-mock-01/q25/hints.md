## Hint 1

`kubectl exec` runs a command in a container that already exists, and
this Pod's only container has no tools worth running. There is a
different verb for adding one to a live Pod — `kubectl -h` lists it, and
`kubectl debug -h` is worth reading in full because almost every flag it
takes matters to this question.

The two files can then be produced with an ordinary `exec` into the
container you added.

## Hint 2

`--image` chooses what the new container runs, `-c` names it, and a third
flag decides whether it can see another container's processes at all.
Without that flag `ps` shows one line: itself.

An ephemeral container whose command exits is finished, and you cannot
`exec` into a container that is not running — so give it something that
keeps running, and do the fetching from a second command.

Redirect on the instance rather than inside the container: the
debugging container has no `/opt/course`.
