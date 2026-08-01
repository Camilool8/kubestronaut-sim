**The PVC stays in the `Pending` state indefinitely** is correct: naming a `storageClassName` tells Kubernetes exactly which provisioner should dynamically create a volume for this claim. When that StorageClass does not exist, there is no provisioner to invoke and no matching pre-created PersistentVolume to bind to, so the claim simply has nothing to bind against — it does not fail loudly, it waits.

Why the others are wrong:

- **The claim is rejected by the API server at creation time** — the API server validates the PVC's shape (fields, types), not whether a referenced StorageClass currently exists; the object is accepted and persisted, then sits unbound.
- **Kubernetes falls back to the cluster's default StorageClass automatically** — a fallback to the default only happens when `storageClassName` is omitted entirely. Naming a class, even one that does not exist, opts out of that fallback.
- **A 10Gi volume is provisioned from whichever StorageClass has the most free capacity** — dynamic provisioning is never capacity-based matchmaking across classes; it always uses the exact class named on the claim, or none at all.
