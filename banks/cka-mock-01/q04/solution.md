# Solution 4

There are two faults here, one in each CoreDNS, and the second one only
becomes visible once the first is repaired.

Start by reproducing the failure and comparing it with a name that works:

```bash
k -n cygnus exec deploy/dns-probe -- nslookup ledger.sim.internal
k -n cygnus exec deploy/dns-probe -- nslookup kubernetes.default.svc.cluster.local
```

The cluster.local name answers, so CoreDNS is up and its default server
block is healthy. The internal name waits and then reports a server
failure — a query that went somewhere and never got a reply, which is a
different symptom from "no such name".

## The stub domain

Cluster DNS reads its whole configuration from one ConfigMap:

```bash
k -n kube-system get cm coredns -o jsonpath='{.data.Corefile}'
```

Two server blocks come back. The default `.:53` block, with the
`kubernetes cluster.local ...` plugin, is fine. Below it is the stub for
the internal zone, pointed at an address nothing answers on:

```
sim.internal:53 {
    errors
    forward . 10.255.255.254
}
```

`forward` wants the address of the nameserver that owns the zone, and
here that nameserver is a Service. Read its ClusterIP from the API:

```bash
k -n cygnus get svc sim-dns
```

Edit the ConfigMap, replace that one address, and leave every other line
of the file alone:

```bash
k -n kube-system edit cm coredns
```

```
sim.internal:53 {
    errors
    forward . <ClusterIP of svc/sim-dns>
}
```

The Service publishes 53 for both UDP and TCP and sends it to the port
the resolver listens on, so plain port 53 is right and nothing needs to
be written after the address.

CoreDNS mounts that ConfigMap, and kubeadm's default block enables the
`reload` plugin, so the change would be picked up on its own within about
half a minute. Restarting is how to not wait, and how to find out at once
whether the file still loads:

```bash
k -n kube-system rollout restart deploy coredns
k -n kube-system rollout status deploy coredns
```

A replica that never becomes ready means the file no longer loads —
usually a brace that was not closed — and
`k -n kube-system logs -l k8s-app=kube-dns` names the line.

## The zone data

Ask again and the name now resolves, but to an address that belongs to
nothing:

```bash
k -n cygnus exec deploy/dns-probe -- nslookup ledger.sim.internal
k -n cygnus get svc ledger
```

The resolver is authoritative for the zone, and its records are its own
Corefile:

```bash
k -n cygnus get cm sim-dns -o jsonpath='{.data.Corefile}'
```

The `hosts` block still carries the address `svc/ledger` had before it
was recreated. Put the current ClusterIP in its place:

```bash
k -n cygnus edit cm sim-dns
```

```
sim.internal:5300 {
    errors
    hosts {
        <ClusterIP of svc/ledger> ledger.sim.internal
        ttl 30
    }
    reload 10s
}
```

The resolver holds the zone it read at startup until the changed file
reaches its container, so restart it rather than waiting on the mounted
copy to catch up:

```bash
k -n cygnus rollout restart deploy sim-dns
k -n cygnus rollout status deploy sim-dns
```

## Verify

From inside the cluster, which is the only place cluster DNS is reachable
from:

```bash
k -n cygnus exec deploy/dns-probe -- nslookup ledger.sim.internal
k -n cygnus exec deploy/dns-probe -- wget -q -T 4 -O- http://ledger.sim.internal
```

The address matches `svc/ledger` and the name serves the ledger web page.

If a lookup still fails, split the path in two by asking the resolver
directly — `nslookup ledger.sim.internal <ClusterIP of svc/sim-dns>` — a
correct answer there with a failure through cluster DNS means the stub
block is still wrong, and a wrong answer there means the zone data is.
