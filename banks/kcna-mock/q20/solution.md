**It allows PersistentVolumes to be provisioned dynamically when a PersistentVolumeClaim requests the class** is correct: a StorageClass names a provisioner (typically a CSI driver) and its parameters. When a PVC references the class, the provisioner creates a matching PersistentVolume on demand, so administrators no longer have to pre-create PVs by hand for every request.

Why the others are wrong:

- **It enforces storage capacity limits for each namespace** — per-namespace limits on storage requests are handled by ResourceQuota objects, not by a StorageClass.
- **It mounts a volume into every Pod in the cluster automatically** — volumes are only attached to Pods that explicitly declare them in their spec; no object mounts storage into all Pods automatically.
- **It encrypts all data written to PersistentVolumes by default** — encryption depends on the capabilities and parameters of the underlying storage backend or driver; simply defining a StorageClass does not encrypt anything.
