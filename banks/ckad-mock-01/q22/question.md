# Question 22 | The ambassador pattern

*Solve this question on instance: `ssh instance-2`*

Namespace `dorado` runs a backend, exposed by Service `payments-backend`
on port `80`. An application needs to reach it, but the team wants the
application to know nothing about where the backend lives — it should
just talk to `localhost`. That is the **ambassador** pattern: a container
beside the app that proxies its outbound traffic.

A ConfigMap named `ambassador-conf` already exists in `dorado`. It holds
an nginx configuration that listens on port `8080` and forwards to the
backend Service.

Create a Pod named `checkout` in Namespace `dorado` with two containers:

1. `app`, image `busybox:1.37`, running `sh -c "sleep 3600"`. It must
   have **no** knowledge of the backend — no environment variable, no
   volume, nothing naming `payments-backend`.
2. `ambassador`, image `nginx:1.29-alpine`, with `ambassador-conf`
   mounted as a volume named `conf` at `/etc/nginx/conf.d`.

When it works, this succeeds from inside the `app` container:

```bash
k -n dorado exec checkout -c app -- wget -qO- http://localhost:8080
```

The Pod must be running.
