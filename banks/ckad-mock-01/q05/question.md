# Question 5 | Init container and native sidecar

*Solve this question on instance: `ssh instance-1`*

Namespace `lyra` already runs a Deployment `feed-source`, exposed by a
Service of the same name on port `80`.

Create a Deployment named `feed-writer` in Namespace `lyra` with **1
replica** and three containers, all using image `busybox:1.37`:

1. An **init container** named `wait-for-source` that blocks until
   `feed-source` actually answers, then exits. Use
   `sh -c "until wget -q -O /dev/null http://feed-source; do sleep 2; done"`.
2. The main container, named `writer`, running
   `sh -c "while true; do date >> /var/log/feed/app.log; sleep 2; done"`.
3. A **native sidecar** named `shipper` running
   `sh -c "tail -F /var/log/feed/app.log"`. It must be declared as a
   sidecar — restarted independently and started before the main
   container — not as a second entry under `containers`.

`writer` and `shipper` share an **emptyDir** volume named `feed-logs`,
mounted at `/var/log/feed` in both. The init container must not mount it.

Once the Pod is running, save the sidecar's log output to
`/opt/course/5/shipper.log` on `instance-1`.
