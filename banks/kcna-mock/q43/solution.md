**Use a PersistentVolumeClaim backed by a CSI-provisioned PersistentVolume, so the storage follows the pod independently of the node** is correct: `emptyDir` is ephemeral storage tied to the pod's lifetime on a particular node, so its contents vanish when the pod goes away. A PersistentVolumeClaim bound to a network-attached volume provisioned through a CSI driver decouples the data from any single node, so when the pod is rescheduled the volume is attached and mounted on the new node with the data intact.

Why the others are wrong:

- **Switch to a `hostPath` volume so the data lives on the node's filesystem** — `hostPath` pins the data to one node's local disk; if the pod is rescheduled elsewhere, the data stays behind on the original node and is inaccessible.
- **Increase the pod's `terminationGracePeriodSeconds` so data has time to persist** — the grace period only delays shutdown so processes can exit cleanly; it does not move or preserve the contents of an ephemeral volume.
- **Add a second replica so each pod keeps its own copy of the data** — extra replicas each get their own empty `emptyDir`; replication of application data does not happen automatically, so this neither preserves nor shares the data.
