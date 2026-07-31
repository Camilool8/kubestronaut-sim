**A PVC is a request for storage by a user that binds to a matching PV** is correct: a PersistentVolume represents a piece of storage available in the cluster (provisioned statically by an admin or dynamically by a StorageClass), while a PersistentVolumeClaim is the user-facing request for capacity and access modes. Kubernetes binds the claim to a PV that satisfies it, and Pods then reference the PVC by name.

Why the others are wrong:

- **A PV is a request for storage that a PVC fulfills by provisioning a disk** — this reverses the roles: the claim is the request and the volume is the resource that fulfills it, not the other way around.
- **A PV and a PVC are two representations of the same API object** — they are two distinct API resources with their own lifecycles; a PV can exist unbound, and a PVC can wait in Pending until a suitable PV appears.
- **A PVC creates storage directly on the node's local filesystem by default** — a PVC does not write to node disks by itself; it binds to a PV whose backing storage is defined by the PV or by the StorageClass's provisioner.
