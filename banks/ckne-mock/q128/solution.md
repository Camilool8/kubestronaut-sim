**The second one fails with "address already in use"** is correct: The netns belongs to the sandbox (pause container); all the pod's containers share it — that's why localhost works between them and ports collide.

Why the others are wrong:

- **It works: each container has its own network namespace** — containers in a pod share the sandbox's network namespace — that is why they reach each other over localhost.
- **The kubelet creates a second IP** — a pod has one network namespace and therefore one IP per family; the kubelet never allocates addresses per container.
- **Traffic is balanced between them** — the kernel binds a listening socket to one process; a second `bind()` on the same address and port is refused, not multiplexed.
