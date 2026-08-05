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
| `python3` | `./sim up` and `./sim reset` read JSON fields with it (`sim:11`, `sim:166-169`). |
| `curl` | `./sim up`, `./sim reset` and `./sim doctor` poll the facilitator with it. |
| `bash` | `./sim` uses `$SECONDS` and `set -o pipefail`. |
| ~9GB RAM available to Docker | An XFCE desktop plus a two-node cluster. |
| ~25GB free disk | The images alone are about 10GB. |

**`./sim up` needs `python3`.** It reads `state` out of `/api/boot`
with it (`sim:11`), so without `python3` every poll yields an empty
state, no phase line is printed, and the command spins until
`SIM_BOOT_BUDGET` expires rather than finishing. `./sim doctor` reports
it as `MISSING (./sim up needs it)` (`sim:119`).

## Commands

| Command | What it does | What it destroys |
|---|---|---|
| `./sim up [bank]` | `docker compose up -d --build`, then polls `/api/boot`. With no bank it waits only for the shell to settle — `idle`, meaning up with nothing chosen — and returns in seconds, having built no exam environment. With a bank it waits for that exam's environment to report ready, printing each phase as it changes. | Nothing. |
| `./sim down` | `docker compose down --remove-orphans`. Volumes survive, so the next `up` resumes the same exam — including a running attempt. | Nothing. |
| `./sim purge` | `down`, then removes the project's volumes one at a time, skipping the one holding attempt history. | Eight volumes: the kind cluster and its image cache, `/shared` (ready marker, active bank, ssh keys), the session file, both `/opt/course` directories, both podman stores, and the exam registry. **Not** `state`. |
| `./sim purge --all` | `down -v`. Prints what it is about to destroy first. | All nine volumes, `state` included — every attempt ever graded on this machine, with no backup and no undo. |
| `./sim doctor` | Preflight report: Docker, Compose, `python3`, RAM, disk, cgroups, warm volumes, UI. | Nothing. |
| `./sim reset` | POSTs `/api/control/reset` and polls `/api/control/status` until the job settles. Same code path as the UI's New attempt button. | The session, both instances' work directories and podman stores, the exam registry's contents, and the kind cluster. |
| `./sim ssh [instance]` | `docker compose exec <instance> su - candidate`, defaulting to `instance-1`. | Nothing. |
| `./sim status` | `docker compose ps`. | Nothing. |
| `./sim grade` | Runs the facilitator's read-only scoreboard against the environment as it stands (`docker compose exec facilitator /entrypoint.sh grade`). Scores the whole bank, or — on a [pooled](bank-spec.md#pooling-a-bank-specexamlength) one — the open attempt's drawn subset, since the questions it did not draw were never seeded. Hands-on banks only: an mcq bank's answers live in the session, not the cluster, so `grade` refuses with a pointer to the UI/API rather than printing a misleading 0%. | Nothing. It records no result and writes no session state. |
| `./sim help` | Prints the usage string. It is also the default with no argument (`sim:4`), and what an unknown subcommand prints before exiting 1 (`sim:176`). | Nothing. |

### grade

The scoreboard reads the session file to find out which questions the
open attempt asks, and scores those. On every unpooled bank that changes
nothing — the whole bank is seeded at boot, so the attempt and the bank
are the same set — and with no attempt open it falls back to the whole
bank, which is what it has always done.

It matters on a pooled bank. `ckad-mock-01` draws 22 of 26 and only the
drawn questions are ever seeded, so scoring the pool would score four
questions whose Namespaces do not exist and cannot: a perfect attempt
printed **191/217 (87%)** before this scoping existed. With no attempt
open on such a bank it says so on stderr and grades the pool anyway,
against an environment that holds none of it.

It remains a reader. It never resumes the attempt, never arms a timer and
never writes the session file, which is what lets it run as a second
process beside the live server.

### up

**Nothing is built until an exam is chosen.** A bare `./sim up` brings
the stack up, waits for it to settle, and prints where to pick an exam.
It waits for the boot state to reach `idle` rather than merely for the
UI to answer: the facilitator answers within a second or two, while
`k8s-env` still has the two exam-independent phases ahead of it (the
inner Docker daemon, then the chart repository) and reports `booting`
throughout. Returning there printed "Choose an exam" over a browser
still showing a boot screen. It is seconds either way, and it never
waits for an exam. There is no cluster, no seeded questions and no default bank:
guessing one costs several minutes and is thrown away the moment the
candidate picks something else. `k8s-env` rests in a new `idle` boot
state, the facilitator serves the exam selector with no bank loaded, and
choosing one runs the conductor's own build.

Naming a bank — `./sim up ckad-mock-01` — additionally builds that
exam's environment and blocks with the phase printout, which is what the
smoke suite and anyone who already knows what they want are doing. The
argument sets `BANK` for that compose invocation and nothing more — see
[BANK](#bank) below.

`up` exits 1 in two cases: `/api/boot` reported `failed`, in which case
the error is printed verbatim (`sim:53-59`); or the boot budget elapsed
(`sim:31-37`). Both print a `docker compose logs k8s-env` invocation
that shows the rest.

### reset

Requires a running stack: it drives the conductor through the
facilitator at `http://localhost:8080`. The five phases are
end-session, wipe-instances, recreate-cluster, restart-instances and
verify (`conductor/internal/control/control.go:170-208`).

Cached images are kept, so a reset needs no network. Bank switching is
not available here — use the exam selector, or see [BANK](#bank).

### Choosing between down, reset and purge

| Goal | Command |
|---|---|
| Stop for now, resume the same attempt later | `./sim down` |
| Start a fresh attempt on the same bank | `./sim reset` |
| Reclaim disk, or make the `BANK` argument take effect again | `./sim purge` |
| Erase every attempt this machine has ever graded | `./sim purge --all` |

Purge keeps the `state` volume. Purge is what people run when the
environment is wedged, which is exactly the moment losing five
certifications of progress would hurt most; `--all` is the deliberate
way to lose it, and export from the app first if it matters.

### doctor

The disk check runs `alpine:3.21` (`sim:126`), so the first `doctor` on
a clean machine pulls that image.

## Configuration variables

| Variable | Default | Read at |
|---|---|---|
| `SIM_BIND` | `0.0.0.0` | `docker-compose.yaml:21-23`, `docker-compose.yaml:208` |
| `SIM_BOOT_BUDGET` | `3600` | `sim` — how long `./sim up <bank>` waits for that exam's environment |
| `SIM_SHELL_BUDGET` | `300` | `sim` — how long a bare `./sim up` waits for the shell to settle. Far smaller because it waits for a container runtime and a chart repository, never for a cluster |
| `BANK` | unset | `sim`, and every service's compose environment. No default: nothing is built until an exam is chosen |
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

Seconds `./sim up <bank>` waits for a ready state before giving up. It
bounds the wait, not the boot: the environment carries on building after
the command exits 1.

```bash
SIM_BOOT_BUDGET=7200 ./sim up ckad-mock-01
```

### SIM_SHELL_BUDGET

The same idea for a bare `./sim up`, which waits for the boot state to
reach `idle` rather than `ready`. Much smaller by default because the
two phases it covers are a container runtime and a chart repository —
measured at about eight seconds — and the inner daemon has its own 180s
deadline underneath it. It never waits for a cluster.

```bash
SIM_SHELL_BUDGET=600 ./sim up
```

### BANK

Names the bank to activate, and only ever on a first boot.
`bootstrap.sh` writes `/shared/bank` if it does not exist and reads it
if it does (`images/k8s-env/bootstrap.sh:15-21`); the facilitator, the
instances and the docs proxy all prefer that file over their `BANK`
environment. So once the shared volume exists, the conductor owns the
active bank and `BANK` is ignored.

Unset is the normal case and not a fallback: with neither the file nor
the variable, `start.sh` stops before the bootstrap and the environment
waits to be told which exam to be.

```bash
./sim up ckad-mock-01           # same as BANK=ckad-mock-01 ./sim up
```

Switch banks from the exam selector. To make the argument matter again, run
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
reaches `exam` and `speed` attempts and deliberately not Training, which
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
