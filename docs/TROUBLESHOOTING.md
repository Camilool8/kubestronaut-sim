# Troubleshooting

Indexed by what you see, in the order problems tend to happen.

## Collect this first

```bash
./sim doctor                    # environment preflight
./sim status                    # which containers are up
docker compose logs k8s-env     # the cluster host, where boots fail
```

## Before a boot

Most rows here are something `./sim doctor` or `.\sim.ps1 doctor` reports;
a few are errors you would hit at launch, before doctor ever runs. Run
doctor before a first boot on a new machine.

| Symptom | Cause | Fix |
|---|---|---|
| `docker : NOT REACHABLE` | Daemon not running, or your user cannot reach its socket | Start Docker Desktop, or add yourself to the `docker` group |
| `compose : MISSING` | Compose v2 absent. The v1 `docker-compose` binary is not a substitute | Install the Compose v2 plugin |
| `python3 : MISSING` | `./sim` reads JSON with `python3`. Bash launcher only — `.\sim.ps1 doctor` has no such check, since it parses JSON natively | Install `python3`. Without it, `up` prints no phases and spins until the boot budget expires |
| `RAM to docker : NGB << LOW` | Under 8GB reaches Docker. The desktop plus a two-node cluster wants ~9GB | Raise the memory limit in Docker Desktop → Resources |
| `disk for images : NGB << LOW` | Under 25GB free. The images alone are ~10GB | Free space, or `./sim purge` to drop an old install's volumes |
| `warm volumes : none` | Not a fault — this is a cold first boot | Expect several minutes. Later boots resume |
| `line endings : N script(s) have CRLF` | A clone made before `.gitattributes` existed checked out `sim`, the `.sh` scripts and `images/k8s-env/preload.txt` as CRLF | Nothing to do — `./sim up` or `.\sim.ps1 up` repairs them in place before building |
| `exec /entrypoint.sh: no such file or directory` | An image was built from that CRLF checkout before a launcher's repair ever ran, so the corruption is baked into the image, not just the clone | `./sim up` or `.\sim.ps1 up` — it repairs the checkout, then rebuilds |
| `env: 'bash\r': No such file or directory` when running `./sim` itself | `sim`'s own shebang line has a trailing `\r`, so the OS never gets far enough to run the repair inside it. Reachable only on a WSL or Git-Bash checkout made with an old Git for Windows, before it defaulted to LF | Re-clone, or force a re-checkout: `git ls-files -z \| xargs -0 rm -f && git checkout -- .` |
| `.\sim.ps1 cannot be loaded because running scripts is disabled` | Windows blocks unsigned scripts by default | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or `powershell -ExecutionPolicy Bypass -File .\sim.ps1 up` |
| `container OS : windows` | Docker Desktop is in Windows-containers mode | Right-click the tray icon → *Switch to Linux containers* |
| `RAM to docker : NGB << LOW` on Windows | WSL2 allocates itself a fraction of host RAM | Create `%UserProfile%\.wslconfig` with `memory=10GB`, then `wsl --shutdown` |

## During a boot

| Symptom | Cause | Fix |
|---|---|---|
| `The environment failed to start:` | `/api/boot` reported `failed` | Read the printed error, then `docker compose logs k8s-env` |
| `Gave up waiting after 3600s.` | Boot budget elapsed. It may still be working | `docker compose logs -f k8s-env`. Raise with `SIM_BOOT_BUDGET=<seconds> ./sim up` |
| `up` prints no phase lines and never finishes | `python3` is missing, so every poll yields an empty state | Install `python3` |
| The UI shows boot progress, not the exam selector | Expected. The facilitator answers before the cluster is ready | Wait. The page shows the same phases the terminal does |
| The next `up` rebuilds from scratch | The volumes were removed. `./sim purge` does this; `./sim down` does not | Use `down` to stop and resume — see [cli.md](cli.md#choosing-between-down-reset-and-purge) |

## During an attempt

| Symptom | Cause | Fix |
|---|---|---|
| Copying in the terminal does not reach the host clipboard | Firefox will not grant the required gesture | Use Chrome, or the Clipboard panel, which works in any browser. Press `?` for shortcuts |
| A pasted em dash arrives as a hyphen | The clipboard channel reduces to ASCII | Expected |
| A documentation page will not load in the exam Firefox | The site is outside the proxy allowlist | Expected — see [SECURITY.md](../SECURITY.md) |
| A question needs an image the cluster does not have | Nothing verifies `images/k8s-env/preload.txt` against what the banks reference | Report it |
| Building an image is slow and disk-hungry | Podman uses the `vfs` storage driver on the instances | Expected. The questions' images are small enough that it measures the same |
| `podman run` reports a cgroup controller is unavailable | Cgroup creation is disabled — podman sits below a hierarchy it does not own | Expected. Plain `podman run` works as typed |
| An Ingress is rejected on `kubectl apply` | The ingress `ValidatingWebhookConfiguration` is left in place, matching the real exam | Fix the Ingress. The rejection is intended |
| An Ingress or NodePort works from the host but the question fails | Host publishing is convenience only. No grading check depends on it | Test in-cluster — see below |

## At grading time

| Symptom | Cause | Fix |
|---|---|---|
| A check scores 0 and the resource looks correct | Questions are graded on behaviour, not on the shape of the YAML | Reproduce the grader's test in-cluster before assuming a bug |
| `Reset failed: <error>` | The conductor's reset job did not settle | Read the error, then `docker compose logs conductor`. Fallback: `./sim purge && ./sim up` |
| You want a score without ending the attempt | Use `./sim grade` | It records no result and touches no session state |

Test the way the graders do — from inside the cluster, not the host:

```bash
kubectl -n <ns> run tmp --rm -it --restart=Never --image=nginx:alpine -- curl -m 5 <svc>
```

## Nothing here matches

1. Rebuild from nothing:

   ```bash
   ./sim purge && ./sim up
   ```

   This destroys eight volumes, including any in-progress attempt. Your
   attempt history survives — see
   [cli.md](cli.md#choosing-between-down-reset-and-purge).

2. If the failure is in the simulator rather than your environment, open
   an issue with the `./sim doctor` output and the relevant
   `docker compose logs`.
