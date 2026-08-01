**`kubectl rollout status deployment/<name>`** is correct: this command reports the rollout's live progress — how many replicas have been updated, how many are available, and whether the rollout is still making progress or is blocked — which is exactly what is needed to tell "slow but proceeding" apart from "genuinely stuck". It is the direct, purpose-built tool for checking a rollout's real-time state.

Why the others are wrong:

- **`kubectl get replicasets`** — this shows how many ReplicaSets exist and their replica counts, which is useful supporting context, but it does not report whether the rollout controller considers itself still progressing or blocked.
- **`kubectl logs deployment/<name>`** — this streams application log output from one arbitrarily-chosen Pod behind the Deployment; it says nothing about the rollout's OWN progress, which is a controller-level concern, not something the application logs.
- **`kubectl top deployment`** — this is not a valid `kubectl top` target at all (`kubectl top` reports live resource usage for nodes or pods only), and even resource usage would not indicate rollout progress.
