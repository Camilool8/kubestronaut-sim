# Troubleshooting

Symptoms, in the order they tend to happen: before a boot, during a
boot, during an attempt, and at grading time.

This page is indexed by what you see. [cli.md](cli.md) is indexed by
command and explains what each one does — when a row here says "see
cli.md", the explanation is there rather than repeated.

Collect this first:

```bash
./sim doctor                    # environment preflight
./sim status                    # which containers are up
docker compose logs k8s-env     # the cluster host, where boots fail
```

## Before a boot

Every row here is something `./sim doctor` reports (`sim:66-99`). Run it
before a first boot on a new machine; it is cheaper than finding these
twenty minutes in.

| Symptom | Cause | Fix |
|---|---|---|
| `docker : NOT REACHABLE` | The Docker daemon is not running, or your user cannot reach its socket | Start Docker Desktop, or add yourself to the `docker` group |
| `compose : MISSING` | Compose v2 is absent. The v1 `docker-compose` binary is not a substitute | Install the Compose v2 plugin |
| `python3 : MISSING (./sim up needs it)` | `./sim` reads JSON with `python3` (`sim:11`) | Install `python3`. Without it `up` prints no phase lines and spins until `SIM_BOOT_BUDGET` expires rather than finishing |
| `RAM to docker : NGB << LOW` | Under 8GB reaches Docker. The XFCE desktop plus a two-node cluster wants ~9GB | Raise the VM memory limit in Docker Desktop's Resources settings |
| `disk for images : NGB << LOW` | Under 25GB free. The images alone are ~10GB | Free space, or `./sim purge` to drop the volumes of an old install |
| `warm volumes : none` | Not a fault. It means this is a cold first boot, the slowest path | Expect several minutes. Later boots resume |

## During a boot

| Symptom | Cause | Fix |
|---|---|---|
| `The environment failed to start:` then an error | `/api/boot` reported `failed` (`sim:53-59`) | Read the printed error, then `docker compose logs k8s-env` for the rest |
| `Gave up waiting after 3600s.` | The boot budget elapsed. The environment may still be working (`sim:31-37`) | `docker compose logs -f k8s-env` to see whether it is progressing. Raise it with `SIM_BOOT_BUDGET=<seconds> ./sim up` |
| `up` prints no phase lines and never finishes | `python3` is missing, so every poll yields an empty state | Install `python3`; see the row above |
| The UI loads but shows boot progress rather than the lobby | Expected. The facilitator answers before the cluster is ready | Wait. The page shows the same phases the terminal does |
| Boot succeeds, then the next `up` rebuilds from scratch | The volumes were removed — `./sim purge` does this, `./sim down` does not | Use `down` to stop and resume; see [Choosing between down, reset and purge](cli.md#choosing-between-down-reset-and-purge) |

## During an attempt

| Symptom | Cause | Fix |
|---|---|---|
| Copying in the exam terminal does not reach the host clipboard | Reading the host clipboard and writing the terminal's copy back both need a gesture Firefox will not grant | Use Chrome, or use the Clipboard panel, which covers both in any browser. Press `?` for the shortcut list |
| A pasted em dash arrives as a hyphen, curly quotes arrive straight | The clipboard channel reduces to ASCII and drops non-ASCII outright | Expected. A hyphen beats losing the paste |
| A documentation page will not load in the exam Firefox | The proxy allowlist matches by subdomain and has no deny-override, so a site outside the allowlist is blocked | Expected. See [../SECURITY.md](../SECURITY.md) for what the proxy permits |
| A question needs an image the cluster does not have | Nothing verifies `images/k8s-env/preload.txt` against what the banks reference | Report it. A missing preload entry only surfaces as a question that needs the network |
| Building an image on an instance is slow and disk-hungry | Podman on the instances runs the `vfs` storage driver, chosen over granting the instances more capabilities | Expected. See [follow-ups.md](follow-ups.md) |
| An Ingress is rejected on `kubectl apply` | The ingress `ValidatingWebhookConfiguration` is left in place, matching the real exam | Fix the Ingress. The rejection is the intended behaviour |
| An Ingress or NodePort works from the host but the question still fails | Host publishing is for your convenience. No `validate.d` check may depend on it | Test in-cluster, which is what the graders do (see below) |

## At grading time

| Symptom | Cause | Fix |
|---|---|---|
| A check scores 0 and the resource looks correct | Questions are graded on behaviour wherever behaviour is the point, not on the shape of the YAML | Reproduce the grader's test in-cluster before assuming a bug |
| `Reset failed: <error>` | The conductor's reset job did not settle cleanly (`sim:101-115`) | Read the error, then `docker compose logs conductor`. `./sim purge && ./sim up` is the fallback |
| You want a score without ending the attempt | `./sim grade` runs the session-free scoreboard | It records no result and touches no session state. See [cli.md](cli.md) |

Test the way the graders do — from inside the cluster, not from the
host:

```bash
kubectl -n <ns> run tmp --rm -it --restart=Never --image=nginx:alpine -- curl -m 5 <svc>
```

## Nothing here matches

`./sim purge && ./sim up` rebuilds from nothing. It destroys all eight
volumes, including any in-progress attempt — see
[cli.md](cli.md#choosing-between-down-reset-and-purge) for what each
command removes.

If the failure is in the simulator rather than your environment, open an
issue with the `./sim doctor` output and the relevant
`docker compose logs`.
