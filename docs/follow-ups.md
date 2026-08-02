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
- **No attempt history and no cross-attempt analytics.** One attempt
  record, overwritten per attempt. [../PRODUCT.md](../PRODUCT.md) states
  this as a durable constraint, so proposals that depend on a history
  store are out of scope rather than pending.
- ~~**`spec.domainWeights` is read by no Go code.**~~ **No longer true.**
  It is now a runtime value in three places: `exam.Load` derives
  `Exam.Domains` from it, `exam.DrawMCQ` stratifies a pooled draw by it,
  and both graders weight the final score by it. Kept here struck through
  rather than deleted because this entry was cited as settled, and a
  reader who remembers it needs to know it was overturned rather than
  simply not find it.
- **`spec.environment.kubernetesVersion` and `nodes` are
  informational.** They are surfaced to the UI and drive nothing.

## Where the milestone history went

The per-milestone review notes that used to fill this file are in the
git log and in [history/](history/). They were a changelog wearing a
backlog's clothes: closed items left in place as strikethrough, sections
ordered neither by date nor by priority, and five items duplicated
across milestones.
