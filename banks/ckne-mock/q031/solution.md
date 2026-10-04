**Two backendRefs on the HTTPRoute with weights 90 and 10** is correct: HTTPRoute supports native traffic splitting: multiple `backendRefs` with weights. You can also route the canary by header/cookie with `matches.headers` in a separate rule.

Why the others are wrong:

- **Create 10 replicas of the old version and 1 of the new** — the ratio of replicas sets a rough 1/11 split only if load is perfectly even, cannot be tuned independently of capacity, and shifts every time either side scales.
- **sessionAffinity: Canary on the Service** — `sessionAffinity` accepts `None` or `ClientIP`; there is no `Canary` value and Services do not split traffic between versions.
- **Use two Gateways with the same hostname** — two Gateways compete for the same hostname; which one a client reaches depends on DNS, not on a controlled percentage.
