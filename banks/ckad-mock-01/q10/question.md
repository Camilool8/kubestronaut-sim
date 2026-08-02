Team Orion needs somewhere to keep its archives, in Namespace `orion`.

1. Create a PersistentVolume named `archive-pv`:
   - capacity `2Gi`
   - access mode `ReadWriteOnce`
   - `hostPath` at `/mnt/archive`
   - storage class name `manual`
   - it must survive the deletion of any claim that binds it
2. Create a PersistentVolumeClaim named `archive-pvc` in Namespace
   `orion` that requests `1Gi` with access mode `ReadWriteOnce` and
   storage class `manual`. It must end up **Bound** to `archive-pv`.
3. Create a Pod named `archiver` in Namespace `orion`, image
   `nginx:1.29-alpine`, container named `web`, with:
   - the claim mounted at `/var/archive`
   - an additional **emptyDir** volume named `scratch` mounted at
     `/var/scratch`

The Pod must reach `Running`.

The cluster has a default storage class that provisions volumes
dynamically. Naming a storage class of your own is what keeps it out of
the way.
