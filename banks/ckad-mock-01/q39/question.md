Namespace `telescopium` runs StatefulSet `shard` with 3 replicas. Its
Pods carry the label `app=shard` and each serves HTTP on port `80`. The
StatefulSet names `shard` as its governing Service, and that Service does
not exist — so no Pod in the set has a DNS name of its own.

1. Create the missing Service: name `shard`, Namespace `telescopium`,
   **headless**, selecting `app=shard`, publishing port `80` with
   `targetPort` `80`. Do not change the StatefulSet.
2. Record the per-Pod DNS name of each of the three Pods in
   `/opt/course/39/shard-names` on `instance-1` — one fully qualified
   name per line, ending `.svc.cluster.local`, and nothing else in the
   file.

Each Pod answers with its own name, so once the Service exists you can
tell `shard-0` from `shard-2` from inside the cluster:

```bash
k -n telescopium exec shard-0 -- curl -s http://shard-2.shard.telescopium.svc.cluster.local/
```
