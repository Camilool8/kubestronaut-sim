The chart repository `sim` is already configured, and Namespace `caelum`
is empty. Chart `sim/sim-cache` installs a cache workload whose defaults
are one replica of `nginx:1.29-alpine`.

Team Caelum keeps every deviation from a chart's defaults in a file that
is reviewed and committed, never in a shell command.

1. Write a values file at `/opt/course/34/cache-values.yaml` on
   `instance-2` that overrides **only** two of the chart's values: the
   replica count, to `3`, and the image tag, to `1.27-alpine`. Everything
   else must keep coming from the chart.
2. Install chart `sim/sim-cache` into Namespace `caelum` as release
   `object-cache`, **taking those values from that file**, not from
   `--set` arguments.
3. Leave the file where it is. It is the reviewed artifact, and the
   grader reads it.

The release must end up `deployed`, with 3 ready replicas running
`nginx:1.27-alpine`.
