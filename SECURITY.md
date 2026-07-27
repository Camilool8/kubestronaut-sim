# Security

## What this is

kubestronaut-sim is a **single-user practice tool you run on your own
machine**. It hands you a Linux desktop, two shells, and a throwaway
Kubernetes cluster, then grades what you did with them.

That shapes everything below. There is no account system, no multi-user
separation, and no attempt to stop the person sitting at the keyboard
from doing anything — they own the machine already. What *is* defended is
narrower and worth stating precisely, because the difference matters the
moment you publish a port.

**Not defended, by design:**

- the candidate against themselves — you can read every answer off disk
- the host against the candidate, beyond ordinary container isolation
- anything at all, if an untrusted party can reach the published ports

**Defended:**

- the Docker socket, from every container the candidate can reach
- the host, from the exam instances, to the extent container isolation
  and a five-capability allowlist provide (see below)

## There is no authentication

Anyone who can reach port `8080` can start your exam, end your exam, and
open the exam desktop — which is a real shell with cluster-admin on the
practice cluster and outbound network access.

This is not an oversight to be fixed with a password field. A local
single-user tool that asked you to log in would be theatre. It does mean
the only thing standing between the simulator and anyone else is **which
interface it listens on**.

## SIM_BIND

`SIM_BIND` sets the host interface every published port binds to — the
UI on `8080`, the cluster's ingress on `8081`/`8443`, and the NodePort
band `30080-30082`.

```bash
./sim up                        # default: 0.0.0.0, reachable on your LAN
SIM_BIND=127.0.0.1 ./sim up     # loopback only
```

**The default is `0.0.0.0`**, so you can build the environment on a
desktop and sit the exam from a laptop. That is a deliberate convenience
with a real cost: on a coffee-shop network, a conference wifi, or any
network you do not control, it hands a shell to whoever looks for it.
Use loopback there.

## Container privileges

| Container | Privilege | Why |
|---|---|---|
| `k8s-env` | `privileged: true` | Runs Docker-in-Docker to host the kind cluster. Unavoidable. |
| `instance-1`, `instance-2` | five capabilities | Podman builds an image for one question. |
| everything else | none | — |

The instances hold `SYS_ADMIN`, `SYS_CHROOT`, `MKNOD`, `SETFCAP` and
`SYS_RESOURCE`, plus a writable `/sys/fs/cgroup` and the host cgroup
namespace. `SYS_ADMIN` in particular is broad, and this set should be
read as "meaningfully less than root on the host, but not a strong
boundary".

They ran fully `privileged` until Debian 13 brought podman 5.4.2.
Podman 4.3.1 ignored most of `containers.conf`, so no narrower
configuration worked at all; 5.4.2 honours it, and each capability above
was established by removing it and watching what broke.
`images/instance/containers.conf` documents the three settings that
replaced privileges rather than being granted them.

## The conductor is the one real boundary

Resetting the environment and switching exams means destroying and
rebuilding the cluster, which needs the Docker socket. That power lives
in exactly one container:

- `conductor` is the **only** container with `/var/run/docker.sock`
- it sits alone with the facilitator on an `internal: true` network — no
  host port, not on the exam network, unreachable from the desktop or
  the instances
- everything it does arrives through the facilitator's
  `/api/control/*` reverse proxy

The candidate's browser can reach that proxy, and that is intentional:
the boundary being defended is **privilege, not candidate access**. A
candidate resetting their own exam is a feature. A container the
candidate has a shell in being able to talk to the Docker socket is not.

## What the session gates are not

The desktop returns `403` until a session is running, and the solutions
endpoint returns `403` until one has ended. Neither is a security
control. They exist for fidelity with the real exam, and every
`solution.md` sits unencrypted in `banks/` on your own disk the whole
time. Read them whenever you like — they are yours.

## The documentation proxy

The exam desktop has no direct internet access. Its Firefox reaches an
allowlist of documentation sites through `docs-proxy`, which mirrors the
real exam's restriction and is *not* a security control — it stops you
accidentally cheating, not a determined attacker. The allowlist matches
a host or any of its subdomains with no deny-override, so permitting
`kubernetes.io` necessarily permits `discuss.kubernetes.io`, which the
real exam disallows. Tracked in `docs/follow-ups.md`.

The instances, unlike the desktop, do have direct internet access —
`helm repo add` and `podman build` need it.

## Reporting

There is no security contact and no coordinated disclosure process,
because there is no deployed service to compromise: every instance of
this runs on somebody's laptop, from source they can read. If you find
something wrong here, open an issue.

If you are considering running this somewhere shared or persistent —
don't, without changing it first. It was not built for that, and nothing
in it assumes an adversary.
