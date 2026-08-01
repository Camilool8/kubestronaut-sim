**`kubectl apply` computes a diff against the object's last applied configuration and can update an existing object to match the file, while `kubectl create` only creates a new object and fails if one with that name already exists** is correct: `apply` is declarative and idempotent — running it repeatedly against the same (or an updated) file converges the live object toward what the file describes, which is why it is the command GitOps-style workflows build on. `create` is a one-shot imperative command with no update semantics at all.

Why the others are wrong:

- **`kubectl create` supports YAML manifests, while `kubectl apply` only accepts JSON** — both commands accept either YAML or JSON files interchangeably; file format is not what distinguishes them.
- **`kubectl apply` only works on Deployments, while `kubectl create` works on any object kind** — both commands work identically across every object kind the API server understands; neither is restricted to a particular kind.
- **`kubectl apply` requires a running admission webhook, while `kubectl create` does not** — admission webhooks (if any are configured) apply uniformly to every write request regardless of which kubectl subcommand produced it; this is not a distinguishing factor between the two.
