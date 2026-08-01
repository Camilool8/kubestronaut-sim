A candidate applies this PersistentVolumeClaim:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-claim
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-nvme
  resources:
    requests:
      storage: 10Gi
```

No StorageClass named `fast-nvme` exists in the cluster. What happens to `data-claim`?
