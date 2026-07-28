## Hint 1

Both containers are ordinary entries under `containers` — this is not
a sidecar question, both just run forever. The whole exercise is the
shared volume.

If `metrics.prom` is empty, the two containers are not looking at the
same directory.

## Hint 2

One `emptyDir` volume named `telemetry`, and a `volumeMounts` entry in
*both* containers with `mountPath: /var/run/telemetry`. Same path in
both — different paths is the failure mode this question is built around.

Copy the two commands verbatim from the question; the quoting is fiddly
and retyping it is how this question gets lost.

Check with `kubectl -n pictor exec telemetry -c adapter -- cat
/var/run/telemetry/metrics.prom`.
