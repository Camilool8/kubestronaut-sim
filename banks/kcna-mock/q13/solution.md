**The ReplicaSet controller sees that observed state (2 Pods) differs from desired state (3 Pods) and creates a replacement Pod** is correct: this is Kubernetes' declarative model in action. The ReplicaSet's spec records the desired state; a controller runs a continuous reconciliation loop comparing that desired state with what actually exists, and it takes action to close any gap. Deleting a Pod creates a gap of one, so the controller immediately creates a new Pod to restore the count.

Why the others are wrong:

- **The Pod stays deleted until someone reapplies the manifest, because Kubernetes only acts when a manifest is submitted** — controllers reconcile continuously against the stored desired state; no human action or re-submission is needed for recovery.
- **The ReplicaSet scales itself down to 2 replicas to match the new observed state** — reconciliation works in the opposite direction: Kubernetes changes actual state to match desired state, never the desired state to match reality.
- **The kube-scheduler restarts the deleted Pod on the same node with the same name** — the scheduler only assigns nodes to new Pods; the replacement is a brand-new Pod with a new name created by the ReplicaSet controller, and it may land on any suitable node.
