**A Deployment manages one or more ReplicaSets on the user's behalf, creating a new ReplicaSet for each rollout so it can orchestrate rolling updates and rollbacks between versions** is correct: the ReplicaSet is the lower-level object actually responsible for keeping a specified number of identical Pod replicas running; a Deployment sits above it, and when the Pod template changes, it creates a NEW ReplicaSet for the new version and scales the old one down, which is what makes a controlled rollout (and a rollback to a previous ReplicaSet) possible.

Why the others are wrong:

- **A ReplicaSet manages multiple Deployments, one per replica** — this inverts the real hierarchy; a Deployment owns ReplicaSets, never the other way around, and a ReplicaSet has no concept of "managing" a Deployment at all.
- **They are two names for the exact same object, kept for backward compatibility** — a Deployment and a ReplicaSet are distinct API kinds with different specs and different controllers; a Deployment is genuinely a layer of orchestration on top of ReplicaSets, not a synonym.
- **A ReplicaSet only exists transiently during a rollout and is deleted once the rollout finishes** — old ReplicaSets are scaled down to zero replicas after a rollout but are retained (by default, up to a configurable history limit) precisely so a rollback has something to scale back up.
