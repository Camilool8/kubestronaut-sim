A nightly report has been staged on node `sim-worker`, in the directory
`/mnt/q23-data`, and the file `report.txt` inside it has to reach a Pod.
The only StorageClass this cluster ships provisions new, empty volumes, so
publishing a directory that already exists means building the whole chain
by hand. Namespace `mensa` already exists.

1. Create a StorageClass named `q23-local`:
   - provisioner `kubernetes.io/no-provisioner`
   - volume binding mode `WaitForFirstConsumer`

2. Create a PersistentVolume named `q23-report-pv`:
   - a `local` volume whose path is `/mnt/q23-data`
   - capacity `1Gi`, access mode `ReadWriteOnce`, class `q23-local`
   - required node affinity matching `kubernetes.io/hostname` **In**
     `sim-worker` — a `local` PersistentVolume without node affinity is
     rejected by the API server

3. In namespace `mensa`, create a PersistentVolumeClaim named
   `report-data` asking class `q23-local` for `1Gi` `ReadWriteOnce`.

4. In namespace `mensa`, create a Pod named `report-reader` running image
   `nginx:1.29-alpine`, with the claim `report-data` mounted at `/data`.
   When it is running, `cat /data/report.txt` inside the Pod must print the
   staged report.

The claim stays `Pending` from the moment you create it until the Pod that
consumes it is scheduled. That is what `WaitForFirstConsumer` means and it
is not a fault to repair.

```bash
k get sc,pv
k -n mensa get pvc,pod
k -n mensa exec report-reader -- cat /data/report.txt
```
