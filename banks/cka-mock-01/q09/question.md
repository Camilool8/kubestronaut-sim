Team Tucana ships its web front end with Helm. Namespace `tucana` is empty,
and the chart repository `sim` is already configured on this instance.

1. Install chart `sim/sim-web` **version 1.0.0** into Namespace `tucana` as
   release `storefront`, overriding exactly two of the chart's values: the
   replica count to `3` and the Service port to `8080`. Everything else keeps
   coming from the chart.
2. Upgrade that same release to chart version **1.1.0**, keeping both
   overrides. It must end up `deployed`, running 3 ready replicas behind a
   Service that answers on port `8080`.
3. Render the manifests that release now consists of — chart version 1.1.0,
   release name `storefront`, the same two overrides — into
   `/opt/course/9/manifest.yaml` on `instance-1`, **without installing or
   applying anything further**. Leave the file there; the grader reads it.

Both the replica count and the Service port must be carried by the release's
own values. Reaching them with `kubectl scale`, `kubectl edit` or
`kubectl patch` does not count.
