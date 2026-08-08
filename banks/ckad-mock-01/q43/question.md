Deployment `session-store` in Namespace `horologium` runs 2 replicas.
Its container serves fine when you reach it, and the kubelet keeps
killing it anyway — the `RESTARTS` column climbs and never stops.

1. Find out why from the Pods' events and save the evidence to
   `/opt/course/43/evidence`. The kubelet's own message about the failing
   check must be in that file, **copied as it appears**, and so must the
   port it names.
2. Correct the fault. The container must still be liveness-checked by an
   HTTP GET of `/` — do not remove the probe and do not change its
   timings. Only the thing it is aimed at is wrong.

When you are done both replicas must be ready and must have stopped
restarting — a freshly rolled-out replica starts at **0** and stays
there.
