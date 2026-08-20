# Security

kubestronaut-sim is a single-user practice tool you run on your own
machine. It hands you a Linux desktop, two shells, and a throwaway
Kubernetes cluster, then grades what you did with them.

This page covers `./sim up`. Hosted deployments have a different threat
model — see [Hosted deployments](#hosted-deployments).

## The one thing to know

**There is no authentication anywhere in this stack.**

Anyone who can reach port `8080` can:

- Start your exam.
- End your exam.
- Open the exam desktop — a real shell with cluster-admin.
- Read, export or erase your attempt history.

Two controls stand between that and a stranger, and neither is
authentication:

- **Which interface it listens on.** This is the whole defence against
  someone else on the network, and it defaults to loopback: a plain
  `./sim up` publishes on `127.0.0.1` only, so nothing off the machine
  reaches the stack at all.

  Reaching it from another machine is a deliberate opt-in:

  ```bash
  SIM_BIND=0.0.0.0 ./sim up       # reachable on your LAN
  ```

  ```powershell
  .\sim.ps1 up -Bind 0.0.0.0      # reachable on your LAN
  ```

  Do that only on a network you control, and read [SIM_BIND](#sim_bind)
  first — your host firewall does not cover a published port.

- **An origin check on every state-changing route.** The facilitator
  refuses a state-changing request that carries a cross-site `Origin` or
  `Sec-Fetch-Site`. The check wraps the whole mux, so the
  `/api/control/*` proxy to the conductor is behind it too. A request
  sending neither header is allowed — that is `curl`, `./sim` and
  `tests/smoke.sh`, none of which a browser can impersonate.

The second exists because the first does not address the attacker who
matters here. A page in another tab can send a `POST` to `:8080` from
the candidate's own browser: the request originates on the machine
running the stack, so the loopback default does not touch it. Without
the origin check, any site the candidate visits could end a live attempt
or trigger a reset. The response is opaque to the caller either way, so
the risk was always destruction, never disclosure.

Neither control identifies anybody. Anyone who can genuinely reach
`:8080` still can do everything in the list above.

## Scope

**Defended:**

- The Docker socket, from every container the candidate can reach.
- The host from the exam instances, to the extent container isolation
  and a five-capability allowlist provide.

**Not defended, by design:**

- The candidate against themselves — you can read every answer off disk.
- The host against the candidate, beyond ordinary container isolation.
- Anything at all, if an untrusted party can reach the published ports.

## SIM_BIND

Sets the host interface every published port binds to: the UI on `8080`,
the cluster's ingress on `8081`/`8443`, and NodePorts `30080-30082`.

| Value | Effect |
|---|---|
| `127.0.0.1` (default) | Loopback only. Nothing off the machine can reach it. |
| `0.0.0.0` | Reachable on your LAN. Lets you build on a desktop and sit the exam from a laptop, or a KCNA attempt from a phone. |

The default lives in exactly one place — `${SIM_BIND:-127.0.0.1}` on
every published port in [docker-compose.yaml](docker-compose.yaml).
Neither launcher sets it, so a direct `docker compose up` gets the same
default as `./sim up`.

**Your host firewall does not cover a published port.** Traffic to one
is forwarded to the container rather than delivered to the host, so it
traverses Docker's own `DOCKER-USER` and `DOCKER` chains and never
reaches the `INPUT` chain that `ufw` and `firewalld` manage. `ufw deny
8080` does not close a port published on `0.0.0.0`; only a rule in
`DOCKER-USER`, or binding to loopback, does.

## Container privileges

| Container | Privilege | Reason |
|---|---|---|
| `k8s-env` | `privileged: true` | Runs Docker-in-Docker to host the kind cluster. Unavoidable. |
| `instance-1`, `instance-2` | Five capabilities, host cgroup namespace, unconfined seccomp and AppArmor, `/dev/fuse` | Podman builds an image for one question. |
| Everything else | None | — |

The instances hold `SYS_ADMIN`, `SYS_CHROOT`, `MKNOD`, `SETFCAP` and
`SYS_RESOURCE`. Read that set as *meaningfully less than root on the
host, but not a strong boundary*.

**Root ssh to the kind nodes is not a new privilege.** The candidate
gets a root shell on every node of the cluster — the main control plane
included — because CKA-style tasks are node surgery: static-pod
manifests, kubelet units, etcd. Inside the session that grants nothing
they did not already have: the candidate holds cluster-admin on a
cluster whose nodes are containers inside the already-`privileged`
k8s-env, and cluster-admin manufactures a root shell on any node in one
`kubectl debug node/`. The boundary was never the node — it is the
conductor and its `internal: true` network, and that is unchanged.
Breaking the cluster from inside it is allowed by design; recovery is
the reset's purge, which deletes the `sim` cluster and every `aux-*`
cluster and rebuilds.

## ingress-nginx is retired upstream

The cluster's ingress controller is pinned to `controller-v1.15.1`
(`INGRESS_NGINX_VERSION` in
[images/k8s-env/Dockerfile](images/k8s-env/Dockerfile)). That is the last
release the project will ever have. Retirement was announced 2025-11-11,
the Steering Committee and the Security Response Committee restated it
2026-01-29, the final releases shipped 2026-03-19 and the repository was
archived read-only 2026-03-24. There will be no more bugfixes and **no
more security patches**. InGate, the intended successor, is archived too
— `kubernetes-sigs/ingate` is now `kubernetes-retired/ingate`, marked
`[EOL]`.

We are not migrating, and the reason is what this cluster is:

- It is a throwaway kind cluster inside the privileged `k8s-env`
  container, rebuilt from scratch on every reset. It holds nothing worth
  taking.
- No untrusted traffic reaches it. Its clients are the candidate's own
  shells, their own desktop browser, and their own host on `:8081` and
  `:8443` — and on the default loopback bind, that host is the only
  machine that can reach either port.
- The CKAD competency is *"use Ingress rules to expose applications"*.
  The Ingress **API** is not deprecated and is fully supported. One
  controller implementation retired; nothing a candidate learns here
  changed.
- `q08` and `q37` are graded on routing behaviour, so swapping the
  controller risks two working questions and buys a candidate nothing.

**What would force a migration.** Either of these, and only these:

- A real CVE against `controller-v1.15.1`. There will be no patched
  release to move to, so the fix is a different controller.
- The published controller images becoming unavailable. The prebaked
  tarballs delay that for an existing image; they do nothing for a
  rebuild, and nothing at all under `PRELOAD=none`.

**The migration, when one of those fires.** Target [Gateway
API](https://gateway-api.sigs.k8s.io/), which is the project's own
recommendation; a maintained Ingress controller is the stopgap if the
questions have to keep grading `networking.k8s.io/v1` Ingress objects.
Three things have to hold:

1. `banks/ckad-mock-01/q08` and `q37` must grade identically. Both check
   what the controller *routes*, not what the manifest says, so their
   `validate.d` scripts are the acceptance test for the swap — and both
   address the controller by name, `q08` through
   `ingress-nginx-controller.ingress-nginx.svc` and `q37` through that
   Service's cluster IP. A rename breaks the check before the answer.
   `q37` terminates TLS, which is where controllers differ most.
2. `images/k8s-env/bootstrap.sh` installs the controller and waits on
   `deployment/ingress-nginx-controller` by name. Both change together.
3. The prebake list is derived, not written down: the `preload` stage in
   [images/k8s-env/Dockerfile](images/k8s-env/Dockerfile) reads every
   `image:` out of `/opt/sim/ingress-nginx.yaml` alongside
   [images/k8s-env/preload.txt](images/k8s-env/preload.txt). Replacing
   the manifest replaces the tarballs, so `PRELOAD=full` must be rebuilt
   and an offline reset re-checked.

The pinned version does not move until then. Bumping it is not an option
— there is nothing to bump to.

## The conductor is the one real boundary

Resetting the environment needs the Docker socket. That power lives in
exactly one container:

- `conductor` is the only container mounting `/var/run/docker.sock`.
- It sits alone with the facilitator on an `internal: true` network — no
  host port, not on the exam network, unreachable from the desktop or
  the instances.
- Everything reaches it through the facilitator's `/api/control/*`
  reverse proxy.

The candidate's browser can reach that proxy. That is intentional: the
boundary is **privilege, not candidate access**.

## The session gates are not security

Three gates exist for fidelity with the real exam:

| Gate | Behaviour |
|---|---|
| Desktop | `403` until a session is running. |
| Solutions | `403` unless the session ended, or the attempt is in Training mode. |
| Pointer | Refuses to start a hands-on exam when the client sends `X-Sim-Pointer: coarse`. |

None of them is a security control:

- Every `solution.md` sits unencrypted in `banks/` the whole time. That
  is fine locally, where the only person you can cheat is yourself, and
  it still holds on a hosted deployment where the person is a stranger —
  see [Hosted deployments](#hosted-deployments).
- The pointer gate is measured by the client, because no server can see
  a pointer type. An absent header is deliberately not treated as
  touch-only, so `./sim`, `tests/smoke.sh` and `curl` keep working.
- Its claim is "a mobile browser will not start one", not "nothing can".

## Attempt history is unencrypted local data

Every graded attempt is appended to `/state/history.json` in the `state`
Docker volume: which exams you sat, when, how long, your score, and your
weakest domains.

- Plain JSON, unencrypted.
- Outlives the session file, a bank switch, `./sim reset` and
  `./sim purge`.
- Nothing is uploaded. No code in this repository sends it anywhere.

It inherits the absence of authentication above:

| Endpoint | Anyone reaching :8080 can |
|---|---|
| `GET /api/history` | Read the whole record |
| `GET /api/history/export` | Download it |
| `DELETE /api/history` | Erase it |
| `POST /api/history/import` | Add attempts that never happened |

Import merges rather than replaces, so it cannot silently drop what is
already there.

**Erasing it:** `./sim purge` keeps this volume. `./sim purge --all`
deletes it. Both are destructive, with no undo and no backup — export
first if the record matters.

## The documentation proxy

- The exam desktop has no direct internet access. It sits on `examnet`,
  which disables IP masquerade.
- Its Firefox reaches an allowlist of documentation sites through
  `docs-proxy`.
- This mirrors the real exam's restriction. It stops you accidentally
  cheating, not a determined attacker.
- The allowlist matches a host or any subdomain, with no deny-override.
- The instances *do* have direct internet access — `podman build` needs
  it to resolve short image names.

## The desktop opener

The desktop container runs `sim-opener` on `:6081`, so a Training
question's documentation link can be opened as a tab in the candidate's
own Firefox. It is the only thing in the stack that can reach the X
display, and it does start a process, so what bounds it matters:

- **One route.** `POST /open` with a JSON `url`, plus a health check. A
  GET cannot open anything, so a page the candidate visits cannot drive
  their desktop through an image or a link.
- **https only**, and the URL reaches Firefox as an argv element through
  `runuser`, never interpolated into a shell string. There is no quoting
  to get wrong.
- **The facilitator does the real allowlisting.** It forwards a URL only
  when it is byte-equal to one the candidate's current question declares
  and the attempt is in Training. `sim-opener` itself trusts its caller.
- **The browser is still bound by the proxy.** Whatever opens is fetched
  through `docs-proxy` and its allowlist like any other page.

In compose the desktop shares `examnet` with the instances, so a
candidate can reach `:6081` from their own shell. The worst that buys
them is opening an allowlisted page on their own desktop, which they can
already do by typing it into the browser.

## Hosted deployments

A hosted deployment inverts the assumption above: the person at the
keyboard is a stranger, and what they are handed is still a privileged
container with a root shell in it.

| Change | Detail |
|---|---|
| A practical session is privileged, and that is not fixable | It runs a container runtime and builds a cluster inside itself. User namespaces are incompatible with `privileged`. Containment is **placement, not isolation** — run these only on nodes you are willing to rebuild. |
| A NetworkPolicy is part of the deployment, not an option | It denies a session every private range: the cluster API, other namespaces, the nodes, and the link-local range cloud metadata answers on. Installed by default. Without it a session reaches the API server hosting it. |
| The documentation allowlist stops being a network boundary | A Pod is one network namespace and a NetworkPolicy selects Pods, not containers. The desktop and the candidate's shells share one egress, and the shells need theirs. The allowlist still governs the browser. |
| One candidate cannot reach another | Each session is its own Pod, addressed from the verified cookie. History is stored per user, scoped to the owner's directory. |
| The one credential is `COOKIE_KEY` | It signs login cookies and, under a *derived* key, the per-Pod ticket a session uses to record an attempt. A ticket read out of a Pod spec can never be spent as that candidate's login. |
| The answer key is inside the Pod, next to the candidate's root shell | `images/banks/Dockerfile` ships the whole bank tree — 171 `solution.md` and 70 `hints.md` — and the `banks` initContainer copies it into an `emptyDir` that both instances mount. So `cat /banks/ckad-mock-01/q03/solution.md` succeeds mid-attempt, while `GET /api/questions/q03/solution` correctly returns `403`. Assume a hosted candidate can read every answer. |

The instances mount `/banks` because that is where the work happens:
grading runs `validate.d/` from it over SSH, and a question's `setup.sh`
seeds the environment from its `files/`. The facilitator mounts it for a
different reason — it serves `solution.md` and `hints.md` to the API. One
volume serves both needs, so the instances receive the facilitator's half
too. Filtering it needs two `emptyDir`s and two copies — a restructure of
the Pod spec for a threat this product does not otherwise defend against,
and so deliberately not done.

The [solutions gate](#the-session-gates-are-not-security) is therefore a
fidelity control here, exactly as it is locally: it keeps the answer out
of the *app* until the attempt ends. It is not a boundary, and a hosted
deployment should not be sold as one. `./tests` is correctly absent from
the hosted manifest, which is why the 44 worked solution scripts do not
ship with it.

The MCQ flavour has none of this: no cluster, no shell, no privilege.

See [docs/hosting.md](docs/hosting.md) before deploying.

## Brand and affiliation

- Not affiliated with CNCF, The Linux Foundation, or PSI.
- Kubernetes and the certification names are trademarks of The Linux
  Foundation.
- **No Kubernetes, CNCF or Linux Foundation artwork is used or implied**
  — not in the app, not on the landing page, not in the favicon. Every
  mark this product draws is original, in
  `ui/src/components/CertMark.tsx`.
- The certification acronyms as *text* are factual reference and need no
  permission.
- Licensing: Apache-2.0 for code, CC BY-SA 4.0 for question banks
  ([banks/LICENSE](banks/LICENSE)).

## Reporting

There is no security contact for the tool itself — almost every copy
runs on somebody's laptop, from source they can read. **Open an issue.**

For a hosted deployment, that is between you and whoever runs it.
Nothing in this repository identifies one.
