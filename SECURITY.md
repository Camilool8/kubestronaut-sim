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

The only control is which interface it listens on.

```bash
SIM_BIND=127.0.0.1 ./sim up     # loopback only
```

```powershell
.\sim.ps1 up -Bind 127.0.0.1    # loopback only
```

Use that on any network you do not control.

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
| `0.0.0.0` (default) | Reachable on your LAN. Lets you build on a desktop and sit the exam from a laptop. |
| `127.0.0.1` | Loopback only. |

## Container privileges

| Container | Privilege | Reason |
|---|---|---|
| `k8s-env` | `privileged: true` | Runs Docker-in-Docker to host the kind cluster. Unavoidable. |
| `instance-1`, `instance-2` | Five capabilities, host cgroup namespace, unconfined seccomp and AppArmor, `/dev/fuse` | Podman builds an image for one question. |
| Everything else | None | — |

The instances hold `SYS_ADMIN`, `SYS_CHROOT`, `MKNOD`, `SETFCAP` and
`SYS_RESOURCE`. Read that set as *meaningfully less than root on the
host, but not a strong boundary*.

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

- Every `solution.md` sits unencrypted in `banks/` the whole time.
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
