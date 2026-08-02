# Security

## What this is

kubestronaut-sim is a single-user practice tool you run on your own
machine. It hands you a Linux desktop, two shells, and a throwaway
Kubernetes cluster, then grades what you did with them.

There is no account system, no multi-user separation, and no attempt to
stop the person at the keyboard from doing anything — they own the
machine already.

**Not defended, by design:**

- the candidate against themselves — you can read every answer off disk
- the host against the candidate, beyond ordinary container isolation
- anything at all, if an untrusted party can reach the published ports

**Defended:**

- the Docker socket, from every container the candidate can reach
- the host, from the exam instances, to the extent container isolation
  and a five-capability allowlist provide

## There is no authentication

Anyone who can reach port `8080` can start your exam, end your exam, and
open the exam desktop — a real shell with cluster-admin on the practice
cluster. The only thing standing between the simulator and anyone else
is which interface it listens on.

## SIM_BIND

`SIM_BIND` sets the host interface every published port binds to — the
UI on `8080`, the cluster's ingress on `8081`/`8443`, and the NodePort
band `30080-30082`.

```bash
./sim up                        # default: 0.0.0.0, reachable on your LAN
SIM_BIND=127.0.0.1 ./sim up     # loopback only
```

The default is `0.0.0.0`, so you can build the environment on a desktop
and sit the exam from a laptop. That convenience has a real cost: on a
network you do not control, it hands a shell to whoever looks for it.
Use loopback there.

## Container privileges

| Container | Privilege | Why |
|---|---|---|
| `k8s-env` | `privileged: true` | Runs Docker-in-Docker to host the kind cluster. Unavoidable. |
| `instance-1`, `instance-2` | five capabilities, host cgroup namespace, unconfined seccomp and AppArmor, `/dev/fuse` | Podman builds an image for one question. |
| everything else | none | — |

The instances hold `SYS_ADMIN`, `SYS_CHROOT`, `MKNOD`, `SETFCAP` and
`SYS_RESOURCE`. `SYS_ADMIN` in particular is broad, and the set should
be read as "meaningfully less than root on the host, but not a strong
boundary". `docker-compose.yaml:60-98` records what each grant buys and
what was tried instead.

## The conductor is the one real boundary

Resetting the environment and switching exams means destroying and
rebuilding the cluster, which needs the Docker socket. That power lives
in exactly one container:

- `conductor` is the only container with `/var/run/docker.sock`
- it sits alone with the facilitator on an `internal: true` network — no
  host port, not on the exam network, unreachable from the desktop or
  the instances
- everything it does arrives through the facilitator's `/api/control/*`
  reverse proxy

The candidate's browser can reach that proxy, and that is intentional:
the boundary being defended is privilege, not candidate access.

## What the session gates are not

The desktop returns `403` until a session is running. The solutions
endpoint returns `403` unless the session has ended **or** the attempt
is in Training mode, where reading the solution is the point
(`facilitator/internal/api/api.go:239`).

Neither gate is a security control. They exist for fidelity with the
real exam, and every `solution.md` sits unencrypted in `banks/` on your
own disk the whole time.

## The attempt history is unencrypted local data

Every graded attempt is appended to `/state/history.json` in the `state`
Docker volume: which exams you sat, when, how long you took, your score,
and your weakest curriculum domains. It is plain JSON, unencrypted, and
it outlives the session file, a bank switch, `./sim reset` and
`./sim purge` — that durability is the point of it, and it is also the
new thing on disk worth knowing about. Nothing is uploaded, and no code
in this repository sends it anywhere.

It inherits the rest of this document rather than escaping it. Anyone who
can reach port `8080` can read the whole record over `GET /api/history`,
download it from `GET /api/history/export`, and erase it with
`DELETE /api/history` — the same absence of authentication that already
lets them start your exam and open your desktop. `POST /api/history/import`
merges a document in rather than replacing, so an import cannot be used to
silently drop what is already there, but it can add attempts that never
happened. On a network you do not control, `SIM_BIND=127.0.0.1`.

`./sim purge` now keeps this volume, so a purge no longer erases it and
`./sim purge --all` is the deliberate way to. Both are destructive
operations with no undo and no backup: export first if the record matters
to you.

## The documentation proxy

The exam desktop has no direct internet access: it is on `examnet`,
which disables IP masquerade (`docker-compose.yaml:250`). Its Firefox
reaches an allowlist of documentation sites through `docs-proxy`, which
mirrors the real exam's restriction and is not a security control — it
stops you accidentally cheating, not a determined attacker.

The allowlist matches a host or any of its subdomains with no
deny-override, so permitting `kubernetes.io` necessarily permits
`discuss.kubernetes.io`, which the real exam disallows. Tracked in
[docs/follow-ups.md](docs/follow-ups.md).

The instances, unlike the desktop, do have direct internet access.
`podman build` needs it to resolve short image names against Docker Hub.

## Reporting

There is no security contact and no coordinated disclosure process,
because there is no deployed service to compromise: every instance of
this runs on somebody's laptop, from source they can read. If you find
something wrong here, open an issue.
