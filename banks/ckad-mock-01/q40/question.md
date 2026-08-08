Team Cepheus keeps a ledger that no two replicas may share, in Namespace
`cepheus`.

1. Create a **headless** Service named `ledger` in Namespace `cepheus`,
   selecting `app=ledger` on port `80`.
2. Create a **StatefulSet** named `ledger` in the same Namespace:
   - `2` replicas, governed by the Service `ledger`
   - Pod label `app=ledger`
   - one container named `ledger`, image `busybox:1.37`, command
     `sh -c "sleep 86400"`
   - a `volumeClaimTemplates` entry named `data` asking for `128Mi` with
     access mode `ReadWriteOnce`, mounted at `/data` in the container

   Name **no** storage class: the cluster's default one provisions these
   volumes on demand.
3. Both Pods must become `Ready`, and each must end up with a claim of
   its own.
4. Inside each Pod, write that Pod's own name into `/data/owner`, so
   the file reads `ledger-0` in the first replica and `ledger-1` in the
   second.
5. Save the names of the two claims the StatefulSet created to
   `/opt/course/40/claims` on `instance-2` — one name per line, nothing
   else.
