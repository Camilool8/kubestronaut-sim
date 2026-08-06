# Hosting

Everything in this repository runs on one machine with `./sim up`, and
that stays true. This page is about the other shape: running it for
people who have not got 9GB and forty minutes to spare, with sign-in, a
capped pool of concurrent sessions, and attempt history that outlives
the environment it was made in.

The local product is the reference. It is uncapped, has no accounts, and
needs no configuration; a hosted deployment is the same simulator with a
door in front of it. If you want the uncapped one, clone this and run it.

## What is actually deployed

Two things, and the second is created and destroyed on demand:

- **The hub** — one Deployment, one Service, one PersistentVolumeClaim.
  It is the only process reachable from the internet. It does identity,
  seats, the queue, durable history, and a reverse proxy to each
  candidate's own environment. It also serves the exam UI itself, but
  only until a session exists: sign-in, the lobby and the queue are
  screens of the same app the facilitator serves, and there is no
  facilitator to serve them from until a seat has been claimed. Once one
  is running, the proxy takes over and a candidate is served by their
  own Pod.
- **A session Pod, per candidate** — the whole `./sim up` stack as a
  single Pod. Two flavours: `practical` (eight containers, a real
  cluster) and `mcq` (a facilitator and 128Mi, no cluster).

The candidate chooses the **certification**, not the flavour. The hub
reads a bank index staged beside it from the banks image, so the lobby
lists the exams themselves rather than a copy of their names in
`values.yaml`, and the flavour is derived from the bank's own engine. A
seat is then that one exam: the Pod is stamped and sized for it and the
exam selector inside the session offers no other, because changing exam
means a different environment, not a rebuild of this one.

Seats stay per flavour. What a seat costs the cluster is a session Pod,
and every hands-on exam is one, so CKAD and CKA draw from the same
pool — see `sessions.practical.banks` below for sizing one exam's Pod
differently from another's.

The facilitator inside a session has no authentication of any kind and
gains none. It is simply never reachable except through the hub, which
is the property that lets the local product stay untouched: the hub was
built *around* the simulator rather than into it.

## Before you deploy one

**A practical session runs a privileged container.** It builds a real
Kubernetes cluster inside itself with a container runtime, hands a
stranger a root shell next to it, and there is no way to do that
unprivileged — user namespaces are explicitly incompatible with
`privileged`, and the sandboxed runtimes either cannot host a nested
container runtime or need nested virtualization. Treat the nodes that
run these as disposable: deploy on hardware you are willing to rebuild,
keep them out of any node pool that runs something you care about, and
label only the nodes you have made that decision about.

Only one container in the Pod is privileged, and the manifest says which
and why. The two candidate shells carry exactly the five capabilities
`docker-compose.yaml` gives them locally.

The chart ships a NetworkPolicy that stops a session reaching the
cluster hosting it — the API server, other namespaces, the nodes, and
the link-local range cloud metadata answers on. It is on by default.
Turning it off is not a supported configuration; it is the boundary that
makes the paragraph above an accepted risk rather than an open one.

MCQ sessions are unprivileged and tiny. If you only want to host the
multiple-choice exams, set `sessions.practical.seats: 0` and none of the
above applies.

## Install

```bash
helm install kubestronaut-sim deploy/helm/kubestronaut-sim \
  --namespace kubestronaut-sim --create-namespace \
  --values my-values.yaml
```

The chart refuses at render time rather than at boot for the four
configurations that cannot work — GitHub mode with no credentials,
GitHub mode with no base URL, an auth mode that does not exist, and an
HTTPRoute attached to no Gateway. A hub that CrashLoopBackOffs on a
missing client ID has already replaced the working one.

A minimal `my-values.yaml`:

```yaml
hub:
  baseURL: https://sim.example.com
  # A Secret carrying COOKIE_KEY, GITHUB_CLIENT_ID and
  # GITHUB_CLIENT_SECRET. Create it however you create secrets.
  existingSecret: kubestronaut-sim-hub

sessions:
  practical:
    seats: 3
  mcq:
    seats: 30
```

Then point something at the Service. The chart publishes a ClusterIP and
stops there; an `httpRoute` block is offered because Gateway API is what
this project's own deployment uses, and any Ingress or tunnel works as
well.

**One requirement of whatever sits in front:** a WebSocket may stay open
for hours. The desktop stream is one. websockify pings every 30 seconds
from inside the session so the connection is never idle, but a proxy
with a hard maximum-lifetime setting will still cut it, and the
candidate sees their desktop drop mid-question.

## Credentials

`COOKIE_KEY` signs two different things with two keys derived from it:
login cookies, and the per-Pod ticket a session presents when it records
a graded attempt. They are derived rather than shared so a ticket read
out of a Pod spec can never be spent as that candidate's login.

Rotating it signs everyone out and invalidates tickets in flight; losing
it does the same. The chart does not generate one, deliberately — a
chart that minted a key would rotate it on every upgrade that forgot to
pass the old one.

The GitHub OAuth app needs one callback URL: `<baseURL>/hub/auth/callback`.
No scopes are requested beyond the default, and the only thing read from
the account is its numeric id and login.

## Seats, and what a seat is

A seat is held from admission to teardown, not from readiness. Counting
only ready sessions would admit a second candidate while the first is
still booting and hand both of them a half-built cluster.

| Value | Default | What it governs |
|---|---|---|
| `sessions.practical.seats` | 3 | Concurrent hands-on environments, across every hands-on exam |
| `sessions.practical.bank` | `ckad-mock-01` | The exam a hands-on session sits when the request names none. A **default**, not the exam: the lobby offers certifications and sends the chosen one |
| `sessions.practical.banks.<id>.resources` | `{}` | Per-exam container resources, merged over `sessions.practical.resources`, which is itself merged over the manifest. For an exam whose cluster is a different size |
| `sessions.mcq.seats` | 30 | Concurrent multiple-choice sessions |
| `sessions.mcq.bank` | `kcna-mock` | As above, for the multiple-choice pool |
| `sessions.maxAge` | `10h` | The hard cap. A seat is taken back at it |
| `sessions.idleTimeout` | `30m` | No request from the browser for this long and the seat goes back |
| `sessions.queueHold` | `2m` | How long the head of the queue has to claim a seat |
| `sessions.bootTimeout` | `20m` | A boot that has not reached ready by now is failed |
| `sessions.bootConcurrency` | 1 | Pod creations in flight at once |

`bootConcurrency` is the one to leave alone without a reason. Boot is
CPU-bound — one measured session took a four-core node to 3090m while
memory stayed at 25% — so two boots on one node do not take turns, they
both crawl. Raise it only when you have nodes to spread them over.

Going from three seats to five is a values change. Going beyond what
your nodes hold is labelling another node. Neither is a code change.

## Sizing

Per practical session, summed across its eight containers as the
manifest declares them: **3.9Gi / 540m requested, 11.8Gi / 4400m
limit**. The per-container numbers are measured and live in
`deploy/helm/kubestronaut-sim/files/session-pod.yaml`; override them
through `sessions.practical.resources` rather than editing that file.

Those numbers were measured on a two-node cluster. An exam whose bank
asks for more nodes needs more, and
`sessions.practical.banks.<id>.resources` is where it goes: the chart
renders that exam its own Pod manifest and the hub stamps it out for
sessions on that bank only. Seats are unaffected — one pool, one queue,
a differently sized Pod in it.

The limits are deliberately far above the requests, which means seats
are overcommitted: three sessions request 11.8Gi and could in principle
demand 35Gi. If several peak at once a node can OOM mid-exam. Serialised
boots are most of the mitigation — the peak is the boot — and
`emptyDir.sizeLimit` is the rest, which stops a runaway build filling
node disk instead of just its own session.

Node disk is the figure most likely to surprise: the emptyDir volumes
declare **32.9GiB** of `sizeLimit` between them, and 20GiB of that is
the inner Docker daemon's. It is a ceiling rather than a reservation —
a session that never builds an image uses a fraction of it — but three
seats on one node can legitimately ask for 99GiB.

Steady state is cheap. The expensive part is the first three to six
minutes, which is `kind create cluster` plus a CNI, an ingress
controller and every question's setup script.

An MCQ session is about 128Mi and schedules anywhere.

## History

Attempts are the reason to sign in. Every graded attempt in a recorded
mode is posted to the hub as it happens and kept per user on the hub's
volume, which is the only thing in the deployment that is not
disposable — a session Pod's own state dies with the Pod by design, and
that is what makes a seat reclaimable.

Two consequences worth knowing before you run this for other people:

- **A hub that is down when an exam is graded costs the durable copy of
  that attempt.** The session says so in its log rather than failing the
  grade, and retries three times. The candidate still sees their score.
- **Hosted history cannot be imported into.** It is the durable copy
  rather than the fragile one, and accepting an arbitrary attempt
  document would let a record that survives on purpose hold entries that
  were never graded. Export works, and an export from here imports into
  a local `./sim`.

Set `hub.state.existingClaim` if you want the record to survive a
`helm uninstall`. The chart's own PVC is annotated
`helm.sh/resource-policy: keep` for the same reason, so an uninstall
does not take a candidate's history with it.

## Self-hosting behind your own identity

`hub.auth.mode: header` trusts a header set by whatever proxy is in
front — for a deployment that already has SSO. The hub says so at boot,
loudly, because the failure is silent: reachable directly in that mode,
anyone can claim any identity by setting one header.

Set `COOKIE_KEY` in that mode too. It is what turns durable history on,
not what turns login on, and a deployment with seats and a proxy and
silently no history would be missing the one thing a hosted tier is for.

`hub.auth.mode: none` has no identity at all: everyone is the same user
and shares one history. It is for trying the chart, not for people.

## What hosted mode does differently

Not a shorter list than it looks. Each of these is a consequence of a
Pod being one network namespace and one disposable unit:

- The documentation allowlist governs the browser, not the network. A
  Pod is one network namespace, so the desktop and the candidate's
  shells necessarily share one egress and the shells' egress is
  load-bearing (a question builds an image `FROM alpine:3.21`).
  Local behaviour is unchanged and remains the stricter of the two.
- Reset and switch replace the Pod rather than rebuilding in place, so a
  hosted reset costs a full boot and reports different phases.
- Every container except the two candidate shells reports the Pod's
  hostname, because a Pod shares one UTS namespace.
- History import and the CLI's summary route are refused with an
  explanation rather than proxied.
