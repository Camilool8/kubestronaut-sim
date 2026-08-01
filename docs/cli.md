# CLI and configuration

`./sim` is a bash wrapper around `docker compose` at the repository
root: nine subcommands and five configuration variables. Everything
after `./sim up` can also be done from the browser at
`http://localhost:8080`.

## Prerequisites

| Requirement | Needed by |
|---|---|
| Docker Engine, or Docker Desktop | Every service is a container. |
| Docker Compose v2 (`docker compose`) | The stack is a single compose project. |
| `python3` | `./sim up` and `./sim reset` read JSON fields with it (`sim:11`, `sim:110`). |
| `curl` | `./sim up`, `./sim reset` and `./sim doctor` poll the facilitator with it. |
| `bash` | `./sim` uses `$SECONDS` and `set -o pipefail`. |
| ~9GB RAM available to Docker | An XFCE desktop plus a two-node cluster. |
| ~25GB free disk | The images alone are about 10GB. |

**`./sim up` needs `python3`.** It reads `state` out of `/api/boot`
with it (`sim:11`), so without `python3` every poll yields an empty
state, no phase line is printed, and the command spins until
`SIM_BOOT_BUDGET` expires rather than finishing. `./sim doctor` reports
it as `MISSING (./sim up needs it)` (`sim:74`).

## Commands

| Command | What it does | What it destroys |
|---|---|---|
| `./sim up [bank]` | `docker compose up -d --build`, then polls `/api/boot` every 3s, printing each phase as it changes, until the environment reports ready. | Nothing. |
| `./sim down` | `docker compose down --remove-orphans`. Volumes survive, so the next `up` resumes the same exam — including a running attempt. | Nothing. |
| `./sim purge` | `down` plus `-v`. | All eight volumes: the kind cluster and its image cache, `/shared` (ready marker, active bank, ssh keys), the session file, both `/opt/course` directories, both podman stores, and the exam registry. |
| `./sim doctor` | Preflight report: Docker, Compose, `python3`, RAM, disk, cgroups, warm volumes, UI. | Nothing. |
| `./sim reset` | POSTs `/api/control/reset` and polls `/api/control/status` until the job settles. Same code path as the UI's New attempt button. | The session, both instances' work directories and podman stores, the exam registry's contents, and the kind cluster. |
| `./sim ssh [instance]` | `docker compose exec <instance> su - candidate`, defaulting to `instance-1`. | Nothing. |
| `./sim status` | `docker compose ps`. | Nothing. |
| `./sim grade` | Runs the facilitator's session-free scoreboard against the environment as it stands (`docker compose exec facilitator /entrypoint.sh grade`). Hands-on banks only: an mcq bank's answers live in the session, not the cluster, so `grade` refuses with a pointer to the UI/API rather than printing a misleading 0%. | Nothing. It records no result and touches no session state. |
| `./sim help` | Prints the usage string. It is also the default with no argument (`sim:4`), and what an unknown subcommand prints before exiting 1 (`sim:120`). | Nothing. |

### up

The optional bank argument sets `BANK` for that compose invocation and
nothing more — see [BANK](#bank) below.

`up` exits 1 in two cases: `/api/boot` reported `failed`, in which case
the error is printed verbatim (`sim:53-59`); or the boot budget elapsed
(`sim:31-37`). Both print a `docker compose logs k8s-env` invocation
that shows the rest.

### reset

Requires a running stack: it drives the conductor through the
facilitator at `http://localhost:8080`. The five phases are
end-session, wipe-instances, recreate-cluster, restart-instances and
verify (`conductor/internal/control/control.go:109-117`).

Cached images are kept, so a reset needs no network. Bank switching is
not available here — use the lobby, or see [BANK](#bank).

### Choosing between down, reset and purge

| Goal | Command |
|---|---|
| Stop for now, resume the same attempt later | `./sim down` |
| Start a fresh attempt on the same bank | `./sim reset` |
| Reclaim disk, or make the `BANK` argument take effect again | `./sim purge` |

### doctor

The disk check runs `alpine:3.21` (`sim:81`), so the first `doctor` on
a clean machine pulls that image.

## Configuration variables

| Variable | Default | Read at |
|---|---|---|
| `SIM_BIND` | `0.0.0.0` | `docker-compose.yaml:21-23`, `docker-compose.yaml:208` |
| `SIM_BOOT_BUDGET` | `3600` | `sim:26` |
| `BANK` | `ckad-mock-01` | `sim:24`, and every service's compose environment |
| `PRELOAD` | `full` | `images/k8s-env/Dockerfile:94` (build arg, not runtime) |
| `SESSION_DURATION_OVERRIDE` | unset | `facilitator/cmd/facilitator/main.go:91` |

### SIM_BIND

Sets the host interface every published port binds to — all four
entries under [Host ports](#host-ports). The default reaches your whole
LAN and there is no authentication anywhere in the stack, so on a
network you do not control, bind to loopback.

```bash
./sim up                        # default: 0.0.0.0
SIM_BIND=127.0.0.1 ./sim up     # loopback only
```

[SECURITY.md](../SECURITY.md) has the full picture.

### SIM_BOOT_BUDGET

Seconds `./sim up` waits for a ready state before giving up. It bounds
the wait, not the boot: the environment carries on building after the
command exits 1.

```bash
SIM_BOOT_BUDGET=7200 ./sim up
```

### BANK

Names the bank to activate, and only ever on a first boot.
`bootstrap.sh` writes `/shared/bank` if it does not exist and reads it
if it does (`images/k8s-env/bootstrap.sh:15-21`); the facilitator, the
instances and the docs proxy all prefer that file over their `BANK`
environment. So once the shared volume exists, the conductor owns the
active bank and `BANK` is ignored.

```bash
./sim up ckad-mock-01           # same as BANK=ckad-mock-01 ./sim up
```

Switch banks from the lobby. To make the argument matter again, run
`./sim purge` first: that deletes the volume `/shared/bank` lives on.

### PRELOAD

A Docker build arg for `images/k8s-env`, not a variable `./sim` reads.
`full` bakes every Calico, ingress-nginx and workload image into the
image as `docker-archive` tarballs, which is what lets a reset run with
no network. `none` skips that, and is what CI builds with
(`.github/workflows/ci.yml:105`) to check the Dockerfile still builds
without spending the bandwidth.

```bash
docker build --build-arg PRELOAD=none -t sim-k8s-env images/k8s-env
```

### SESSION_DURATION_OVERRIDE

Replaces the bank's exam duration with any Go duration string. It
reaches Exam and Speed attempts and deliberately not Training, which
has no clock to override
(`facilitator/cmd/facilitator/main.go:112-123`).

```bash
SESSION_DURATION_OVERRIDE=20s docker compose up -d --wait facilitator
SESSION_DURATION_OVERRIDE="" docker compose up -d --wait facilitator
```

A development affordance: it is read unguarded at startup, behind no
debug flag, and `tests/smoke.sh` uses it to exercise auto-expiry.

## Host ports

| Host port | Container | Reaches |
|---|---|---|
| `8080` | `facilitator:8080` | Exam UI, the HTTP API, the desktop proxy, and the conductor control proxy. See [api.md](api.md). |
| `8081` | `k8s-env:80` | ingress-nginx over HTTP. Send a `Host:` header, or add an `/etc/hosts` entry. |
| `8443` | `k8s-env:443` | ingress-nginx over HTTPS. |
| `30080-30082` | `k8s-env:30080-30082` | NodePort Services on those three ports. |

Ports 80 and 443 inside `k8s-env` are the kind control-plane node's own
published ports, which ingress-nginx binds by `hostPort`. The
`30080-30082` band is offset on the host so it never contends with
whatever else is listening there.

No `validate.d` check may depend on any of these: the host path is for
you, not for grading. See [bank-spec.md](bank-spec.md).
