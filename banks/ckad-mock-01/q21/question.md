An application writes its metrics in a private format that the team's
scraper cannot read. Rather than change the application, put a second
container beside it that rewrites the output — the **adapter** pattern.

Create a Pod named `telemetry` in Namespace `pictor` with two containers,
both using image `busybox:1.37`, sharing an **emptyDir** volume named
`telemetry` mounted at `/var/run/telemetry` in both:

1. Container `app`, which every 2 seconds overwrites
   `/var/run/telemetry/raw.log` with the single line `cpu=42;mem=71`:

   ```bash
   sh -c "while true; do echo 'cpu=42;mem=71' > /var/run/telemetry/raw.log; sleep 2; done"
   ```

2. Container `adapter`, which every 2 seconds rewrites that file into
   `/var/run/telemetry/metrics.prom`, one `key value` pair per line —
   semicolons become newlines and `=` becomes a space:

   ```bash
   sh -c "while true; do tr ';' '\n' < /var/run/telemetry/raw.log | tr '=' ' ' > /var/run/telemetry/metrics.prom; sleep 2; done"
   ```

When it works, `metrics.prom` inside the adapter contains:

```
cpu 42
mem 71
```

The Pod must be running, and both containers must stay up.
