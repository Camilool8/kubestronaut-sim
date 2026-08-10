# CLI and configuration

`./sim` is a bash wrapper around `docker compose`: nine subcommands and
five configuration variables. `.\sim.ps1` is the same nine subcommands in
PowerShell for Windows — see [install.md](install.md). CI holds the two to
the same subcommand names, the same usage string, and the same exit code for
argv either one refuses, `purge --all` and its casing included
(`tests/check-sim-parity.sh`). The configuration is where they differ on
purpose: the environment variables below have `sim.ps1` flags, listed
alongside them.

Everything after `./sim up` can also be done in the browser at
`http://localhost:8080`.

## Prerequisites

Docker, Compose v2, RAM, disk, and the three host tools `./sim` shells
out to. The list, what each is needed for, and how to obtain it on each
operating system are all in
[install.md](install.md#prerequisites) — including why `python3` and
`curl` are not optional for `./sim`, and why `.\sim.ps1` needs neither.

`./sim doctor` checks every one of them.

## Commands

| Command | Does | Destroys |
|---|---|---|
| `./sim up [bank]` | Repairs any CRLF in tracked scripts, then brings the stack up and polls `/api/boot` | Nothing |
| `./sim down` | Stops the stack. Volumes survive | Nothing |
| `./sim purge` | `down`, then removes eight volumes | Everything except attempt history |
| `./sim purge --all` | `down -v`. Prints what it will destroy first | All nine volumes, **including every attempt ever graded** |
| `./sim doctor` | Preflight: host, Docker, Compose, container OS, `python3`, line endings, RAM, disk, cgroups, volumes, docker access (Linux), clone location (WSL), exam UI | Nothing |
| `./sim reset` | Rebuilds the environment for a fresh attempt | Session, work directories, podman stores, registry, cluster |
| `./sim ssh [instance]` | Shell on an instance, default `instance-1` | Nothing |
| `./sim status` | `docker compose ps` | Nothing |
| `./sim grade` | Read-only scoreboard against the environment as it stands | Nothing |
| `./sim help` | Usage. Also the default with no argument | Nothing |

### Choosing between down, reset and purge

| Goal | Command |
|---|---|
| Stop now, resume the same attempt later | `./sim down` |
| Start a fresh attempt on the same bank | `./sim reset` |
| Reclaim disk, or make the `BANK` argument take effect again | `./sim purge` |
| Erase every attempt this machine has graded | `./sim purge --all` |

`purge` keeps the `state` volume. `--all` is the deliberate way to lose
it — export from the app first.

### up

**Nothing is built until an exam is chosen.**

| Form | Waits for | Typical time |
|---|---|---|
| `./sim up` | Boot state `idle` — the stack is up with no exam chosen | Seconds |
| `./sim up ckad-mock-01` | That exam's environment to report ready, printing each phase | Minutes |

- With no bank there is no cluster, no seeded questions, and no default.
- The bank argument sets `BANK` for that invocation only — see
  [BANK](#bank).
- Phases print as they complete, rather than using
  `docker compose --wait`, which prints one unmoving word and has no
  timeout of its own.

**`up` exits 1 when:**

1. `/api/boot` reported `failed` — the error prints verbatim.
2. The boot budget elapsed.

Both print a `docker compose logs k8s-env` invocation.

### reset

Requires a running stack. It drives the conductor through the
facilitator, in five phases:

1. `end-session`
2. `wipe-instances`
3. `recreate-cluster`
4. `restart-instances`
5. `verify`

Cached images are kept, so a reset needs no network. To switch banks,
use the exam selector rather than `reset`.

### grade

Scores the environment as it stands, without touching session state.

- On an unpooled bank it scores the whole bank.
- On a [pooled](bank-spec.md#pooling-a-bank-specexamlength) bank it
  scores the open attempt's drawn subset, because only drawn questions
  are ever seeded.
- With no attempt open on a pooled bank it warns on stderr and grades
  the pool anyway.
- Hands-on banks only. An MCQ bank's answers live in the session, so
  `grade` refuses rather than printing a misleading 0%.

It never resumes the attempt, arms a timer, or writes the session file,
which is what lets it run beside the live server.

### doctor

The disk check runs `alpine:3.21`, so the first `doctor` on a clean
machine pulls that image.

## Configuration variables

| Variable | Default | `sim.ps1` flag | Purpose |
|---|---|---|---|
| `SIM_BIND` | `127.0.0.1` | `up -Bind <address>` | Host interface every published port binds to |
| `SIM_BOOT_BUDGET` | `3600` | `up <bank> -BootBudget <seconds>` | Seconds `./sim up <bank>` waits for an environment |
| `SIM_SHELL_BUDGET` | `300` | `up -ShellBudget <seconds>` | Seconds a bare `./sim up` waits for the shell |
| `BANK` | unset | `up <bank>` | Bank to activate, first boot only |
| `PRELOAD` | `full` | — | Build arg for `images/k8s-env`, not a runtime variable |
| `SESSION_DURATION_OVERRIDE` | unset | — | Replaces the bank's exam duration |

`sim.ps1` has no flag for `PRELOAD` or `SESSION_DURATION_OVERRIDE` — neither
is set by invoking `up` on either launcher; both reach the stack through
`docker build --build-arg` or a direct `docker compose up -d --wait`, shown
in their own sections below.

### SIM_BIND

```bash
./sim up                        # default: 127.0.0.1, this machine only
SIM_BIND=0.0.0.0 ./sim up       # opt in, reaches your whole LAN
```

```powershell
.\sim.ps1 up                       # default: 127.0.0.1, this machine only
.\sim.ps1 up -Bind 0.0.0.0         # opt in, reaches your whole LAN
```

The default is set in one place, `${SIM_BIND:-127.0.0.1}` on every
published port in `docker-compose.yaml`. Neither launcher sets it —
`-Bind` only exports `SIM_BIND` when you pass it — so a direct `docker
compose up` binds loopback too.

What that default is defending, and what you take on by changing it, is
[SECURITY.md](../SECURITY.md#sim_bind). Read it before `0.0.0.0`: there
is no authentication anywhere in this stack, and your host firewall does
not cover a published port.

### SIM_BOOT_BUDGET

Bounds the wait, not the boot — the environment carries on building
after the command exits 1.

```bash
SIM_BOOT_BUDGET=7200 ./sim up ckad-mock-01
```

### SIM_SHELL_BUDGET

The same idea for a bare `./sim up`, which waits for `idle` rather than
`ready`. Smaller because it covers only a container runtime and a chart
repository — about eight seconds — and never waits for a cluster.

```bash
SIM_SHELL_BUDGET=600 ./sim up
```

### BANK

Applies **only on a first boot**.

- `bootstrap.sh` writes `/shared/bank` if it does not exist, and reads
  it if it does.
- The facilitator, the instances and the docs proxy all prefer that file
  over their `BANK` environment.
- Once the shared volume exists, the conductor owns the active bank and
  `BANK` is ignored.

```bash
./sim up ckad-mock-01           # same as BANK=ckad-mock-01 ./sim up
```

To make the argument matter again, run `./sim purge` first — that
deletes the volume `/shared/bank` lives on.

### PRELOAD

| Value | Effect |
|---|---|
| `full` (default) | Bakes every Calico, ingress-nginx and workload image in as tarballs, so a reset needs no network |
| `none` | Skips it. What CI builds with, to check the Dockerfile still builds |

```bash
docker build --build-arg PRELOAD=none -t sim-k8s-env images/k8s-env
```

### SESSION_DURATION_OVERRIDE

Any Go duration string. Reaches `exam` and `speed` attempts, and
deliberately not Training, which has no clock to override.

```bash
SESSION_DURATION_OVERRIDE=20s docker compose up -d --wait facilitator
SESSION_DURATION_OVERRIDE="" docker compose up -d --wait facilitator
```

A development affordance, read unguarded at startup. `tests/smoke.sh`
uses it to exercise auto-expiry.

## Host ports

| Host port | Container | Reaches |
|---|---|---|
| `8080` | `facilitator:8080` | Exam UI, HTTP API, desktop proxy, conductor control proxy — see [api.md](api.md) |
| `8081` | `k8s-env:80` | ingress-nginx over HTTP. Send a `Host:` header, or add an `/etc/hosts` entry |
| `8443` | `k8s-env:443` | ingress-nginx over HTTPS |
| `30080-30082` | `k8s-env:30080-30082` | NodePort Services on those three ports |

- Every one of them binds `127.0.0.1` unless you set
  [`SIM_BIND`](#sim_bind), so they answer on this machine only.
- Ports 80 and 443 inside `k8s-env` are the kind control-plane node's
  own published ports, bound by ingress-nginx via `hostPort`.
- The `30080-30082` band is offset on the host so it never contends
  with whatever else is listening.
- **No `validate.d` check may depend on any of these.** The host path is
  for you, not for grading — see [bank-spec.md](bank-spec.md).
