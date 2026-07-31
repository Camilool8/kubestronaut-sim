**A container shares the host operating system kernel, while a VM runs its own guest operating system on virtualized hardware** is correct: containers are isolated processes that use kernel features such as namespaces and cgroups, so they start quickly and carry only the application and its dependencies. A virtual machine boots a complete guest operating system on top of a hypervisor, which gives stronger isolation at the cost of more overhead.

Why the others are wrong:

- **A container always includes its own full guest operating system, while a VM shares the host kernel** — this reverses the two definitions; it is the VM that ships a full guest OS and the container that shares the host kernel.
- **Containers require a hypervisor to run, while VMs run directly on the host kernel** — this is also backwards: hypervisors are a virtual machine technology, while containers run as ordinary processes managed by a container runtime.
- **Containers and VMs provide identical isolation because both virtualize hardware** — containers do not virtualize hardware at all; they rely on kernel-level isolation, which is lighter but weaker than a VM's hardware-level boundary.
