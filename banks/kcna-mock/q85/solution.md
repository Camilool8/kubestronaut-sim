**`kubectl debug`** is correct: this command creates an ephemeral container — sharing the target Pod's process namespace (with the right flags) — built from a chosen debugging image (one that DOES include a shell and diagnostic tools), attaches it alongside the running Pod, and lets you inspect the target container's processes and filesystem without modifying or restarting the Pod's own containers.

Why the others are wrong:

- **`kubectl exec`** — `exec` only runs a command inside a container THAT ALREADY EXISTS in the Pod; if that container has no shell at all, there is nothing for `exec` to launch, which is precisely the problem this scenario describes.
- **`kubectl cp`** — this only copies files to or from a container's filesystem; it provides no way to run an interactive shell or inspect a live process.
- **`kubectl attach`** — `attach` connects to the standard input/output of an existing container's already-running process; it cannot add tooling that was never in the image, and there may be no interactive process to attach to at all.
