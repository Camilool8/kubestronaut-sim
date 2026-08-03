# Follow-ups

Open work lives in [GitHub issues](https://github.com/Camilool8/kubestronaut-sim/issues).
This file holds what is not issue-shaped: the places the simulator
diverges from the real exam on purpose, and the trade-offs that were
chosen rather than deferred. Nothing here is a bug report.

## Deliberate divergences from the real exam

These are calibration decisions. Do not "fix" them without deciding to
change the product.

| Divergence | Why |
|---|---|
| Harder than the real exam | The whole point. A candidate who passes here should be comfortable there. |
| 22 questions against a real CKAD's 15-20 | More coverage per sitting. Point budgets still track the published curriculum weights within 2 points. |
| Two-node cluster | The real exam has more. Two is enough for scheduling, affinity and DaemonSet questions, and it is what fits in 9GB. |
| Ingress and NodePorts published to the host | The real exam does not do this. Opening your own Ingress in a browser is a fast way to learn why it is not matching. No `validate.d` check may depend on it. |
| The documentation allowlist has no deny-override | Permitting `kubernetes.io` necessarily permits `discuss.kubernetes.io`, which the real exam disallows. Subdomain matching is what the proxy does. |
| Solutions readable during a Training attempt | Reading the solution is the point of that mode. Exam and Speed keep the gate. |

## Accepted trade-offs

Known, chosen, and not currently worth the cost of changing.

- **Podman on the instances runs with the `vfs` storage driver.** Slower
  and more disk-hungry than overlay, but it works without granting the
  instances more than the five capabilities they already hold.
- **ingress-nginx image digests are stripped** at build time so the
  preloaded tags resolve offline.
- **The ingress `ValidatingWebhookConfiguration` is left in place.** It
  matches the real exam's behaviour, including rejecting a malformed
  Ingress.
- **CI builds images with `PRELOAD=none`.** A full preload in CI would
  cost more minutes than it would catch bugs. Cross-architecture
  coverage is therefore partial, and a cold-cache smoke run on the
  target architecture is the real check.
- **Nothing verifies `images/k8s-env/preload.txt` against what the banks
  reference.** A missing entry surfaces as a question that needs the
  network, which only a cold-cache smoke run catches.

## Constraints that read like gaps

Recorded because each has been proposed at least once and is settled.

- **No authentication, permanently.** See [../SECURITY.md](../SECURITY.md).
  Notes elsewhere of the form "needs auth once hosted" describe a
  scenario that is not planned.
- ~~**No attempt history and no cross-attempt analytics.**~~ **Overturned,
  deliberately.** This was a durable constraint until the design brief
  made cross-attempt progress a product goal, and it is now built: every
  graded attempt in a recorded mode is appended to `/state/history.json`
  in its own volume, and `GET /api/catalog` joins that record to the bank
  list. See [../PRODUCT.md](../PRODUCT.md) for the rules that came with it
  — recorded is not the same as counted, and only the candidate's own
  machine ever holds it. The *live session* file is unchanged: it still
  holds exactly one attempt and is still overwritten by the next.
  Struck through rather than deleted, because this entry was cited as
  settled and a reader who remembers it needs to find out it was reversed
  rather than simply not find it.
- **`spec.environment.kubernetesVersion` and `nodes` are
  informational.** They are surfaced to the UI and drive nothing.
