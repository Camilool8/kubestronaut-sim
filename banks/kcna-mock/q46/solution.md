**Desired state is described declaratively and versioned in Git** and **An automated agent continuously reconciles the cluster toward the state defined in Git** are correct: GitOps rests on these two pillars. Everything the cluster should run is expressed as declarative configuration committed to Git, giving an auditable, reviewable history, and a controller such as Argo CD or Flux continuously compares live state to that declared state and corrects any drift automatically.

Why the others are wrong:

- **Operators apply ad-hoc changes directly to the cluster with kubectl edit** — Direct imperative edits bypass Git, create drift, and leave no reviewable history; GitOps expects every change to flow through a commit, and reconcilers will typically revert such manual edits.
- **Container image binaries are committed to the Git repository alongside manifests** — Images are stored in container registries, not in Git. The Git repository holds the declarative configuration that references image tags or digests, not the image artifacts themselves.
