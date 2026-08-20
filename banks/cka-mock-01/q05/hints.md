## Hint 1

Point everything at the right cluster first — `--kubeconfig ~/.kube/aux-sched`
on every command, or the answers you get are the main cluster's.

Then stop looking at the Pods. `describe` on one of them has nothing to say:
no events, no "0/1 nodes are available", no reason at all. That silence is the
finding. A Pod that the cluster *considered* and rejected carries a reason;
a Pod nothing ever looked at carries none, and exactly one component does the
looking.

```bash
kubectl --kubeconfig ~/.kube/aux-sched -n kube-system get pods
```

## Hint 2

`kube-scheduler` is there and it is in `CrashLoopBackOff`. The container starts,
fails on its own arguments and exits, which is why the Pod's phase still says
`Running` — read the container state, not the phase. The reason it prints on
the way out is one line:

```bash
kubectl --kubeconfig ~/.kube/aux-sched -n kube-system logs \
  -l component=kube-scheduler --tail=5
```

It names a file it cannot find. That file is named in the container's command
line, and the command line lives in the static Pod manifest on the node:

```bash
ssh cka-aux-sched
vi /etc/kubernetes/manifests/kube-scheduler.yaml
```

Compare the `--kubeconfig` flag against the `volumes:` entry a few lines below
it — the flag is supposed to name the kubeconfig this manifest mounts, and one
of the two was changed. Correct the flag and save; the kubelet is watching that
directory and restarts the Pod on its own within seconds. Nothing needs to be
deleted, applied or restarted by hand, and once the scheduler reports `Ready`
the three Pending Pods are bound and running in well under a minute.
