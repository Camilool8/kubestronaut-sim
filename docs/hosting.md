# Hosting

Running the simulator for other people: sign-in, a capped pool of
concurrent sessions, and attempt history that outlives the environment
it was made in.

`./sim up` remains the reference — uncapped, no accounts, no
configuration. A hosted deployment is the same simulator with a door in
front of it.

## Read this first

**A practical session runs a privileged container.**

- It builds a real Kubernetes cluster inside itself and hands a stranger
  a root shell next to it.
- There is no unprivileged way to do that. User namespaces are
  incompatible with `privileged`, and sandboxed runtimes either cannot
  host a nested runtime or need nested virtualization.
- **Treat these nodes as disposable:**
  - Deploy on hardware you are willing to rebuild.
  - Keep them out of any pool running something you care about.
  - Label only the nodes you have made that decision about.

Mitigations that ship by default:

| Control | Effect |
|---|---|
| NetworkPolicy | Denies a session the cluster API, other namespaces, the nodes, and the link-local range cloud metadata answers on. **Turning it off is not a supported configuration.** |
| Scoped privilege | Only one container in the Pod is privileged. The two candidate shells carry the same five capabilities they have locally. |

MCQ sessions are unprivileged and tiny. To host only those, set
`sessions.practical.seats: 0` and none of the above applies.

## What gets deployed

**The hub** — one Deployment, one Service, one PersistentVolumeClaim.

- The only process reachable from the internet.
- Handles identity, seats, the queue, durable history, and a reverse
  proxy to each candidate's environment.
- Serves sign-in, the lobby and the queue itself, until a session exists
  to serve them.

**A session Pod, per candidate** — the whole `./sim up` stack as one
Pod, created and destroyed on demand.

| Flavour | Contains |
|---|---|
| `practical` | Eight containers, a real cluster |
| `mcq` | A facilitator and 128Mi, no cluster |

Candidates choose the **certification**, not the flavour. The hub reads
a bank index staged from the banks image, so the lobby lists real exams
and the flavour is derived from each bank's engine.

A seat is one exam: the Pod is stamped and sized for it, and the
selector inside the session offers no other.

The facilitator inside a session has no authentication and gains none.
It is simply never reachable except through the hub.

## Install

```bash
helm install kubestronaut-sim deploy/helm/kubestronaut-sim \
  --namespace kubestronaut-sim --create-namespace \
  --values my-values.yaml
```

Minimal `my-values.yaml`:

```yaml
hub:
  baseURL: https://sim.example.com
  existingSecret: kubestronaut-sim-hub

sessions:
  practical:
    seats: 3
  mcq:
    seats: 30
```

The Secret must carry `COOKIE_KEY`, `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`.

The chart **refuses at render time** for four configurations that cannot
work:

1. GitHub mode with no credentials.
2. GitHub mode with no base URL.
3. An auth mode that does not exist.
4. An HTTPRoute attached to no Gateway.

### Putting something in front

The chart publishes a ClusterIP and stops there. An `httpRoute` block is
offered because Gateway API is what this project's own deployment uses;
any Ingress or tunnel works.

> **One requirement:** a WebSocket may stay open for hours. websockify
> pings every 30 seconds so the connection is never idle, but a proxy
> with a hard maximum-lifetime setting will still cut it — and the
> candidate's desktop drops mid-question.

## Credentials

`COOKIE_KEY` signs two things, with two keys derived from it:

- Login cookies.
- The per-Pod ticket a session presents when recording an attempt.

They are derived rather than shared, so a ticket read out of a Pod spec
can never be spent as that candidate's login.

- Rotating or losing it signs everyone out and invalidates tickets in
  flight.
- The chart does not generate one, deliberately — a chart that minted a
  key would rotate it on every upgrade that forgot to pass the old one.

**GitHub OAuth app:** one callback URL, `<baseURL>/hub/auth/callback`.
No scopes beyond the default. Only the numeric id and login are read.

## Seats

A seat is held from **admission to teardown**, not from readiness.
Counting only ready sessions would admit a second candidate while the
first is still booting and hand both a half-built cluster.

| Value | Default | Governs |
|---|---|---|
| `sessions.practical.seats` | 3 | Concurrent hands-on environments, across every hands-on exam |
| `sessions.practical.bank` | `ckad-mock-01` | The exam a hands-on session sits when the request names none |
| `sessions.practical.banks.<id>.resources` | `{}` | Per-exam container resources, merged over `sessions.practical.resources` |
| `sessions.mcq.seats` | 30 | Concurrent multiple-choice sessions |
| `sessions.mcq.bank` | `kcna-mock` | As above, for the MCQ pool |
| `sessions.maxAge` | `10h` | Hard cap. A seat is taken back at it |
| `sessions.idleTimeout` | `30m` | No request from the browser for this long and the seat goes back |
| `sessions.queueHold` | `2m` | How long the head of the queue has to claim a seat |
| `sessions.bootTimeout` | `20m` | A boot not ready by now is failed |
| `sessions.bootConcurrency` | 1 | Pod creations in flight at once |

> **Leave `bootConcurrency` at 1** without a specific reason. Boot is
> CPU-bound — one measured session took a four-core node to 3090m while
> memory stayed at 25% — so two boots on one node do not take turns,
> they both crawl. Raise it only when you have nodes to spread them
> over.

Going from three seats to five is a values change. Going beyond what
your nodes hold is labelling another node. Neither is a code change.

## Sizing

Per practical session, across its eight containers:

| | Requested | Limit |
|---|---|---|
| Memory | 3.9Gi | 11.8Gi |
| CPU | 540m | 5900m |

- Per-container numbers are measured and live in
  `deploy/helm/kubestronaut-sim/files/session-pod.yaml`. Override
  through `sessions.practical.resources` rather than editing that file.
- Measured on a two-node cluster. An exam whose bank asks for more nodes
  needs more — put that in
  `sessions.practical.banks.<id>.resources`. Seats are unaffected: one
  pool, one queue, a differently sized Pod in it.

**Overcommitment is deliberate.** Three sessions request 11.8Gi and
could demand 35Gi. If several peak at once a node can OOM mid-exam.
Serialised boots are most of the mitigation — the peak *is* the boot —
and `emptyDir.sizeLimit` is the rest.

**Node disk is the figure most likely to surprise.** The emptyDir
volumes declare **32.9GiB** of `sizeLimit` between them, 20GiB of it the
inner Docker daemon's. It is a ceiling, not a reservation, but three
seats on one node can legitimately ask for 99GiB.

Steady state is cheap. The expensive part is the first three to six
minutes: `kind create cluster`, a CNI, an ingress controller, and every
question's setup script.

An MCQ session is about 128Mi and schedules anywhere.

## History

Every graded attempt in a recorded mode is posted to the hub and kept
per user on the hub's volume — the only thing in the deployment that is
not disposable.

Two consequences:

- **A hub that is down when an exam is graded costs the durable copy of
  that attempt.** The session logs it rather than failing the grade, and
  retries three times. The candidate still sees their score.
- **Hosted history cannot be imported into.** Accepting an arbitrary
  attempt document would let a record that survives on purpose hold
  entries that were never graded. Export works, and an export from here
  imports into a local `./sim`.

Set `hub.state.existingClaim` if you want the record to survive a
`helm uninstall`. The chart's own PVC is annotated
`helm.sh/resource-policy: keep` for the same reason.

## Auth modes

| Mode | Behaviour |
|---|---|
| `github` (default) | GitHub OAuth |
| `header` | Trusts a header set by the proxy in front — for a deployment that already has SSO |
| `none` | No identity. Everyone is the same user and shares one history. For trying the chart, not for people |

> **`header` mode fails silently if the hub is reachable directly** —
> anyone can claim any identity by setting one header. The hub says so
> loudly at boot.

Set `COOKIE_KEY` in `header` mode too. It is what turns durable history
on, not what turns login on.

## What hosted mode does differently

Each is a consequence of a Pod being one network namespace and one
disposable unit:

- The documentation allowlist governs the browser, not the network. The
  desktop and the candidate's shells share one egress, and the shells'
  egress is load-bearing — a question builds an image `FROM alpine:3.21`.
  Local behaviour is unchanged and stricter.
- Reset and switch replace the Pod rather than rebuilding in place, so a
  hosted reset costs a full boot and reports different phases.
- Every container except the two candidate shells reports the Pod's
  hostname, because a Pod shares one UTS namespace.
- History import and `GET /api/history/summary` are refused with an
  explanation rather than proxied. Import would let a durable record hold
  attempts that were never graded; the summary is a projection of
  `GET /api/history`, which the hub already serves in full.
