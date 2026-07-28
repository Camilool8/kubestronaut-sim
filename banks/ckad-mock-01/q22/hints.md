## Hint 1

The `app` container's constraint is defined by absence: no env var,
no volume, nothing that names the backend. The grader checks for that
absence, so a helpful `BACKEND_URL` you added for convenience will fail
it.

Only the ambassador needs the ConfigMap.

## Hint 2

Containers in a Pod share a network namespace, which is why `app` can
reach the proxy on `localhost` without any configuration at all — that
is the whole pattern.

Mount `ambassador-conf` as a volume named `conf` at
`/etc/nginx/conf.d` on the `ambassador` container only. nginx loads
every `.conf` in that directory on start.

Verify with the `wget` command in the question, from inside `app`.
