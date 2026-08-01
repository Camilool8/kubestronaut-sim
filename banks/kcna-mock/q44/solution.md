**The declarative configuration stored in a Git repository** is correct: GitOps is defined by keeping the entire desired state of the system as declarative configuration under version control in Git. Automated tooling then compares the live cluster against what Git declares and reconciles any differences, so Git—not the cluster itself—is the authoritative record.

Why the others are wrong:

- **The live objects currently running in the cluster** — In GitOps the live state is the thing being corrected, not the reference. If the cluster drifts from what Git declares, the reconciler changes the cluster, not the repository.
- **The container images stored in the registry** — A registry holds build artifacts, but it says nothing about which workloads, versions, or configuration should run in the cluster. That desired state lives in Git.
- **The kubectl command history of the operations team** — Imperative command history is exactly what GitOps replaces; it is not versioned, reviewable, or reproducible the way declarative files in Git are.
