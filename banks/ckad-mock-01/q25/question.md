Namespace `perseus` runs Pod `ledger-api`. Its `api` container serves a
health endpoint at `http://127.0.0.1:8080/healthz`, bound to loopback —
there is no Service, and there is nothing a Service could reach.

Diagnose it from inside the Pod, without restarting it and without
changing the container it already runs:

1. Attach an ephemeral debugging container to Pod `ledger-api`, running
   `busybox:1.37`, sharing the `api` container's process namespace. Name it
   what you like — an ephemeral container can never be removed, so a first
   attempt under a name you did not want is not held against you.
2. From inside that container, fetch the health endpoint and save the
   response body to `/opt/course/25/healthz`.
3. Save the command line of the `api` container's main process — as the
   debugging container sees it — to `/opt/course/25/api-process`.

Pod `ledger-api` must still be the same Pod when you are done: one
container named `api`, never deleted and never recreated.
