Namespace `crater` runs the `archive` Deployment: one replica of a single
container named `web`, with no storage of its own. It needs a volume that
is provisioned on demand and that survives the claim being deleted.

The cluster already has a dynamic provisioner behind its default
StorageClass, `standard`. What `standard` will not do is keep anything:
it deletes a volume the moment its claim goes away.

1. Create a StorageClass named `q25-local-retain`:

   | Field | Value |
   |---|---|
   | Provisioner | the same provisioner `standard` uses |
   | Reclaim policy | `Retain` |
   | Volume binding mode | `WaitForFirstConsumer` |

   Do not mark it as the cluster's default class; `standard` keeps that job.

2. Create a PersistentVolumeClaim named `archive-data` in `crater` on that
   class: access mode `ReadWriteOnce`, `1Gi`.

3. Mount `archive-data` into the `archive` Deployment at `/data`, in the
   `web` container.

The claim stays `Pending` until a Pod that uses it is scheduled — that is
what `WaitForFirstConsumer` means. Add the mount, let the Deployment roll,
and the PersistentVolume appears.

A PersistentVolume takes its reclaim policy from the class **at the moment
it is provisioned**. Get the class right before anything binds on it.
