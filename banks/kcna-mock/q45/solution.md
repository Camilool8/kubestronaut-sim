**Pull-based deployment, because an in-cluster agent fetches changes so external systems do not need cluster credentials** is correct: Argo CD and Flux are pull-based GitOps tools. An agent running inside the cluster polls (or is notified about) the Git repository and pulls changes in, which means no CI server or external system needs write access to the Kubernetes API. This shrinks the attack surface and also lets the agent continuously detect and correct drift.

Why the others are wrong:

- **Push-based deployment, because the CI server pushes manifests into the cluster after every build** — That describes the push model (for example, a pipeline running kubectl apply), which is the opposite of how Argo CD operates and requires handing cluster credentials to the CI system.
- **Pull-based deployment, because developers must manually pull and apply each change with kubectl** — The pull in pull-based GitOps is done automatically by the in-cluster controller, not manually by developers.
- **Push-based deployment, because Argo CD pushes commits back to the Git repository** — Argo CD reads desired state from Git and applies it to the cluster; writing commits back to Git is not what defines its deployment model.
