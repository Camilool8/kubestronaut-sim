# Installing

The simulator is eight containers and a two-node Kubernetes cluster. What
differs by operating system is the shell that runs the launcher, the way
memory reaches Docker, and whether `python3` is needed at all.

## What every OS needs

| Requirement | Why |
|---|---|
| Docker Engine or Docker Desktop | Every service is a container |
| Docker Compose v2 (`docker compose`) | The stack is one compose project |
| ~9GB RAM available to Docker | The desktop plus a two-node cluster |
| ~25GB free disk | The images alone are ~10GB |
| cgroup v2 | The instances run with `cgroup: host` |

`./sim doctor` — `.\sim.ps1 doctor` on Windows — checks every one of these
and flags what needs attention.

## Windows

Windows runs the simulator through PowerShell. WSL2 is still required,
because it is what Docker Desktop runs Linux containers on, but nothing
below asks you to open a WSL shell.

### 1. Install WSL2

```powershell
wsl --install
```

Reboot when it asks. This provides the Linux kernel Docker Desktop needs;
the simulator never runs inside the distro it creates.

### 2. Install Docker Desktop

In **Settings → General**, confirm *Use the WSL 2 based engine*. The
simulator cannot run in Windows-containers mode — `.\sim.ps1 doctor`
prints `container OS` and flags it unless the value is `linux`.

### 3. Give WSL2 enough memory

WSL2 allocates itself a fraction of your RAM, which is often under the
~9GB the stack needs. Create `%UserProfile%\.wslconfig`:

```ini
[wsl2]
memory=10GB
```

Then apply it:

```powershell
wsl --shutdown
```

### 4. Clone and run

```powershell
git clone https://github.com/Camilool8/kubestronaut-sim
cd kubestronaut-sim
.\sim.ps1 doctor
.\sim.ps1 up
```

Then open <http://localhost:8080>.

### If PowerShell refuses to run the script

PowerShell's default execution policy blocks running any local `.ps1`
file, signed or not. Either allow local scripts once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Or bypass it per run, changing no policy:

```powershell
powershell -ExecutionPolicy Bypass -File .\sim.ps1 up
```

### Running it from WSL instead

The bash launcher works unchanged inside WSL, and gives faster bind
mounts. Clone **inside the WSL filesystem** — a clone under `/mnt/c` puts
every `./banks` and `./tests` read across the Windows boundary, and
`./sim doctor` warns when it sees one.

```bash
cd ~ && git clone https://github.com/Camilool8/kubestronaut-sim
cd kubestronaut-sim && ./sim doctor && ./sim up
```

## macOS

Docker Desktop, and `python3` for the launcher.

### 1. Docker Desktop

In **Settings → Resources**, raise the memory limit to at least 9GB.

### 2. python3

`./sim` reads JSON with it. macOS ships a stub that prompts rather than a
working interpreter:

```bash
xcode-select --install
```

### 3. Clone and run

```bash
git clone https://github.com/Camilool8/kubestronaut-sim
cd kubestronaut-sim
./sim doctor
./sim up
```

Apple Silicon needs nothing extra. `images/k8s-env` builds arm64 natively.

## Linux

### 1. Docker Engine and the Compose v2 plugin

The v1 `docker-compose` binary is not a substitute. `./sim doctor`
reports `compose : MISSING` when only v1 is present.

### 2. Reach the daemon without sudo

```bash
sudo usermod -aG docker "$USER"
```

Log out and back in. `./sim doctor` reports whether the daemon is
reachable as you.

### 3. cgroup v2

The instances run with `cgroup: host` and bind `/sys/fs/cgroup`, so
cgroup v2 is required. `./sim doctor` prints the version Docker reports.

**Rootless Docker cannot run this stack.** `k8s-env` is a privileged
container.

### 4. Clone and run

```bash
git clone https://github.com/Camilool8/kubestronaut-sim
cd kubestronaut-sim
./sim doctor
./sim up
```

## When something goes wrong

[TROUBLESHOOTING.md](TROUBLESHOOTING.md#before-a-boot) is indexed by
what you see. Its **Before a boot** section covers everything `doctor`
reports.
