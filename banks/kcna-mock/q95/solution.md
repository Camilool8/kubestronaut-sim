**A set of read-only filesystem layers stacked on top of each other, plus a manifest and configuration describing how to assemble and run them** is correct: each layer typically corresponds to one build step and is content-addressed so identical layers can be shared and cached across different images, which is why pulling an image you already have most layers of downloads only what changed. The manifest ties the layers together in order and records metadata like the entrypoint, environment variables, and exposed ports.

Why the others are wrong:

- **A single compressed file containing the entire filesystem as one flat layer** — layering (not a single flat archive) is the defining trait of the OCI image format; it is precisely what enables layer reuse, caching, and efficient incremental pulls.
- **A virtual machine disk image plus a hypervisor configuration file** — container images share the host kernel and contain no virtual hardware or hypervisor configuration at all; that description belongs to VM image formats, not OCI containers.
- **A Kubernetes-specific format that only the kubelet can interpret** — the OCI image spec is a vendor- and orchestrator-neutral standard usable by Docker, containerd, Podman, and any other OCI-compliant runtime; it predates and is independent of Kubernetes.
