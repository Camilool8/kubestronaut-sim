Namespace `cygnus` runs the ledger stack. Its Pods look up the company's
private zone `sim.internal` through cluster DNS, which forwards that zone
to the team's own resolver: the Service `sim-dns` in `cygnus`, a CoreDNS
of its own whose zone data is the ConfigMap `sim-dns` in that Namespace.

Since last week's maintenance no Pod resolves anything under
`sim.internal`. Names under `cluster.local` are unaffected, and must stay
that way.

1. Repair the cluster's DNS configuration so that queries for the zone
   `sim.internal` are forwarded to the resolver Service `sim-dns` in
   `cygnus`. Change **only** the `sim.internal` server block: the default
   server block, which serves `cluster.local`, must keep working exactly
   as it does now.
2. Make the running CoreDNS Pods serve the repaired configuration, with
   every replica ready.
3. Repair the resolver so that `ledger.sim.internal` answers with the
   **current** ClusterIP of the Service `ledger` in `cygnus`, and make
   the running `sim-dns` Pod serve that answer.
4. Confirm from a Pod of the Deployment `dns-probe` in `cygnus` that
   `ledger.sim.internal` resolves to that address.

Leave `dns-probe`, `ledger` and the Service `sim-dns` in place — they are
the application, not the fault.
