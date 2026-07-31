**Declarative rolling updates and rollbacks, managed by creating and scaling ReplicaSets** is correct: a Deployment is a higher-level controller that owns ReplicaSets. When you change the Pod template (for example a new image tag), the Deployment creates a new ReplicaSet and gradually scales it up while scaling the old one down, giving you rolling updates, revision history, and easy rollbacks. This is why you almost always create Deployments rather than ReplicaSets directly.

Why the others are wrong:

- **Stable network identities and ordered startup for each Pod replica** — those are the guarantees a StatefulSet provides for stateful workloads; Deployment replicas are interchangeable and have no stable identity.
- **The guarantee that exactly one Pod runs on every node in the cluster** — that is what a DaemonSet does; Deployments place a chosen number of replicas wherever the scheduler decides.
- **The ability to run Pods to completion on a schedule** — scheduled, run-to-completion work is handled by CronJobs (which create Jobs), not by Deployments, which manage continuously running Pods.
