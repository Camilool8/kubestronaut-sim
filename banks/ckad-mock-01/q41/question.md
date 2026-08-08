Namespace `columba` runs three Pods. Two are serving; one has been
`Pending` since it was created and no container of it has ever started.

1. Write the name of the Pod that will not schedule to
   `/opt/course/41/pod-name` — the name only, nothing else.
2. The scheduler has already said why. Save its message, **copied as it
   appears**, to `/opt/course/41/reason`. Do not paraphrase it.
3. Make that same Pod run. Keep its name, its container name and its
   image exactly as they are, and give the container a memory request of
   `64Mi` instead of the one it has.

Leave the other two Pods alone.

A Pod's resource requests cannot be edited in place, so step 3 needs the
Pod replaced rather than patched — which is also why step 2 has to happen
first.
