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
| 22 questions against a real CKAD's 15-20 | More coverage per sitting. Point budgets still track the published curriculum weights within 2 points. The bank authors 26 and draws 22, so the sitting stays this length as the pool grows. |
| Two-node cluster | The real exam has more. Two is enough for scheduling, affinity and DaemonSet questions, and it is what fits in 9GB. |
| Ingress and NodePorts published to the host | The real exam does not do this. Opening your own Ingress in a browser is a fast way to learn why it is not matching. No `validate.d` check may depend on it. |
| The documentation allowlist has no deny-override | Permitting `kubernetes.io` necessarily permits `discuss.kubernetes.io`, which the real exam disallows. Subdomain matching is what the proxy does. |
| Solutions readable during a Training attempt | Reading the solution is the point of that mode. Exam and Speed keep the gate. |

## Accepted trade-offs

Known, chosen, and not currently worth the cost of changing.

- **The instances' `/opt/course` seeding is pooling-unaware.**
  `images/instance/entrypoint.sh` creates a working directory per
  question and copies each question's `files/` **for the whole pool**, at
  container start — before any draw exists, and never again. On a pooled
  bank that means a candidate can see `/opt/course/23` for a question
  they were not asked, and a question that ships starting material would
  hand it over whether or not it was drawn. Harmless today: no question
  in `ckad-mock-01` ships a `files/` directory, so the only artefact is
  an empty directory. It is recorded here because the fix is not small —
  the conductor's seed job runs on `k8s-env`, which has no access to the
  per-instance `/opt/course` volumes, which is the same reason `files/`
  cannot come from `setup.sh` — and because the day a pooled bank ships
  starting material, this stops being cosmetic.
- **Podman on the instances runs with the `vfs` storage driver.** Slower
  and more disk-hungry than overlay, but it works without granting the
  instances more than the five capabilities they already hold.
- **A build's `RUN` steps use chroot isolation, not a container.**
  `BUILDAH_ISOLATION=chroot`, set in `images/instance/Dockerfile` three
  ways — as an `ENV`, in `/etc/environment`, and via a sudoers
  `env_keep`. Under compose the instances get the host's cgroup namespace
  and crun works; under Kubernetes an unprivileged container gets a
  private one, where crun cannot enable cgroup controllers or attach its
  device-control eBPF program. Granting `privileged` would fix it and
  would make the candidate's own shell the most privileged container in
  the pod, so the isolation of the build step was traded away instead. A
  `RUN` step gets no namespaces of its own; the images the questions build
  are tiny and the candidate is already root there, so nothing current
  notices. One image behaves identically in both places, which is the
  point. The three mechanisms are not redundancy: `ENV` alone never
  reaches a candidate, because sshd sanitises login sessions and sudo
  resets the environment again — and q09 requires sudo.
- **In a hosted session the exam desktop can reach the open web, and no
  NetworkPolicy can change that.** Under compose the desktop sits only on
  `examnet`, which runs with masquerade off, so its only route out is
  `docs-proxy` — `tests/smoke.sh` asserts a plain
  `curl https://example.com` from the desktop fails. A Pod is one network
  namespace and the same call succeeds.
  This is architectural, not a deferred fix. The two instances are on
  `default` as well as `examnet`, so they have ordinary internet access
  even locally (measured: 200 from instance-1, timeout from the desktop),
  and they need it — a question builds an image `FROM alpine:3.21`, which
  podman pulls from Docker Hub. A NetworkPolicy selects Pods, not
  containers, so the desktop and the instances necessarily share one
  egress and the instances' egress is load-bearing. Splitting
  `docs-proxy` out would not help; the instances are the hole.
  What survives is narrower than it sounds: the allowlist still governs
  the browser, which is where candidates actually read documentation, and
  a candidate willing to search the web from an instance shell can
  already do that in the local product. Local behaviour is unchanged and
  remains the stricter of the two.
  The chart's `networkpolicy.yaml` addresses the part that *is*
  fixable — a session reaching the infrastructure hosting it — and says
  the same thing at more length.
- **In a hosted session, containers other than the two instances report
  the Pod's hostname.** Pod containers share a UTS namespace. The
  instances take one of their own (`unshare --uts`, using CAP_SYS_ADMIN
  they already hold for image builds), because the prompt is the
  candidate's only confirmation that `ssh instance-1` landed and it
  otherwise looks identical before and after. The desktop and the four
  service containers keep the Pod's name: the desktop cannot unshare
  without being granted a capability it has no other use for, and its
  prompt is now unambiguous anyway — it is the one that is *not*
  `instance-1` or `instance-2`. Nothing reads a hostname anywhere.
- **In a hosted session, reset and switch replace the Pod rather than
  rebuilding in place.** The conductor cannot restart a container it
  reaches over ssh — a Pod has no per-container restart under
  `restartPolicy: Never` — so `hub/internal/session` deletes the Pod and
  creates a new one, reporting progress in the conductor's own job shape
  so the UI needs no hosted branch. Two consequences, both accepted: the
  phases differ from a local reset's (there is no cluster to rebuild in
  place), and a hosted reset costs a full boot rather than a partial one.
- ~~**In a hosted session, seeding a pooled bank would report no
  progress.**~~ **Closed with the per-exam seat work.** The hub still
  answers `/api/control/status` and `/api/control/log` from its own job
  store while one of ITS jobs is in flight — reset and switch are Pod
  replacement, and the Pod they describe does not exist for most of the
  time they run — but when it has none running it now asks the session
  Pod and forwards the conductor's answer untouched. That is what makes
  the conductor's one remaining job type, `seed`, visible: it is
  triggered by the facilitator server-to-server, between the candidate
  pressing Start and their clock beginning. In-flight beats settled, and
  the hub's own settled job still wins over an idle Pod, so a failed
  reset the candidate has not dismissed does not vanish from under them.
- **Hosted history cannot be imported into, and reports no summary.**
  Both are refused with 501 and an explanation rather than proxied. The
  Pod's own `/state` is ephemeral by design, so a history route answered
  there would answer from the copy that is about to be destroyed — "clear
  my history" would succeed against nothing that lasts. Import exists
  locally because local history is genuinely fragile; hosted history is
  the durable copy, and accepting an arbitrary attempt document would
  only let a record that survives on purpose hold entries that were never
  graded.
- **A hosted attempt is recorded twice, and only one copy is meant to
  last.** The facilitator writes `/state/history.json` exactly as it
  always has — that is what `./sim up` relies on and it does not change
  — and additionally posts the record and the full results document to
  the hub, which keeps it per user on a volume that outlives the Pod.
  The two can disagree for one attempt: a hub that is down when an
  exam is graded costs the durable copy, and the facilitator says so in
  its log rather than failing the grade. Three deliveries are attempted
  because the failure worth retrying is a hub mid-redeploy; a rejected
  ticket is not retried, because retrying sends identical bytes to an
  identical answer.
- **The hosted lease countdown is not shown during a running exam.** The
  header chip carries it, and the header is not rendered over the exam
  screen — that screen has its own topbar with its own clock, and a
  second countdown beside it would be read as the exam's. Two
  consequences, one good and one not. The good one: there is no way to
  destroy an environment mid-attempt by misclick, because the whole
  header — End session included — is simply not rendered over a running
  exam; there is no control there to misclick. The cost: a session whose
  hard cap falls inside an attempt ends it with no warning on screen. Narrow
  in practice — the cap defaults to ten hours against a two-hour exam —
  and the honest fix is a lease indicator in the exam's own topbar
  rather than a second header, which is a change to two exam screens
  rather than to the chip.
- **The hub mirrors the facilitator's cross-attempt rollup rather than
  sharing it.** `hub/internal/store/rollup.go` recomputes what
  `facilitator/internal/history` already computes: which attempts count,
  which certifications the Kubestronaut path holds, and the weakest
  domains across every graded attempt. Sharing it is not available —
  the hub is a separate module, every module here is stdlib-only with no
  `go.sum`, and `history` is an internal package, which Go scopes to its
  own module's tree whatever the `go.mod` says. Lifting it out of
  `internal` would couple the hub's build to the facilitator's for one
  function, and the hub's image copies `hub/` alone. So it is a copy,
  narrowly: only the fields the rollup reads are decoded out of each
  record and the rest stays raw bytes. If the two drift, the symptom is
  a hosted dashboard whose numbers differ from a local one.
- **The session Pod's history ticket is an env var in the Pod spec, not
  a Secret.** It names one user and authorises appending to that user's
  history and nothing else, it is minted per Pod and expires an hour
  after the hard session cap, and it is signed with a key derived from
  `COOKIE_KEY` so it can never be spent as that candidate's login.
  Reading it needs Pod-read in the session namespace, which is already
  well inside the accepted threat model for a namespace whose Pods run
  a privileged container. A Secret would be a second object to create,
  delete and grant RBAC over for no change in who can read it.
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

- ~~**No authentication, permanently.**~~ **Still true of the
  simulator, no longer true of the product.** The facilitator has no
  authentication of any kind and gains none: `./sim up` is unchanged,
  with no accounts and no new required configuration. What changed is
  that a hosted deployment puts `hub/` in front of it — GitHub login,
  capped seats, durable per-user history — and the facilitator is simply
  never reachable except through it. That is the whole reason the
  property survives: the hub was built *around* the simulator rather
  than into it. Struck through rather than deleted, because this entry
  was cited as settled and a reader who remembers it needs to find out
  what it became.
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
- ~~**`spec.environment.kubernetesVersion` and `nodes` are
  informational.**~~ **`nodes` is load-bearing as of the per-exam
  environment work.** `bootstrap.sh` generates the kind config from it —
  `kind-config.yaml` now ships the control-plane node only, and the
  workers are appended per the active bank — so the cluster is the size
  the certification needs rather than the size CKAD needs. Changing it in
  a bank changes the cluster the next build produces. `provider` and
  `kubernetesVersion` are still informational; both are served on
  `GET /api/exam`. Struck through rather than deleted because "read by
  nothing" was cited as settled, and a reader who remembers it needs to
  find out it stopped being true rather than simply not find it.
