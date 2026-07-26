# Question 16 | Health checks

*Solve this question on instance: `ssh instance-2`*

Deployment `orders-api` in Namespace `hydra` runs 2 replicas behind a
Service of the same name, with no health checking of any kind.

Add all three probes to its container, each an HTTP GET of `/` on port
`80`:

1. a **startupProbe** with `periodSeconds: 2` and `failureThreshold: 30`
2. a **readinessProbe** with `periodSeconds: 5` and `failureThreshold: 2`
3. a **livenessProbe** with `initialDelaySeconds: 10` and
   `periodSeconds: 10`

When you are done both replicas must be ready, and the Service must have
**2** ready endpoints — a Pod that never passes its readiness probe is
removed from the Service, so this is what proves the probes are working
rather than merely present.
