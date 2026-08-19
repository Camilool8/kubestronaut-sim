Two hours is not long for an administrator's exam. Every attempt here
draws a fresh 16 of the bank's 26 original questions, the clock is
120 minutes, and you need 66% to pass. Most people who fail knew the
answers — they spent the time in the wrong places. What follows is
technique: the habits that decide how many of the sixteen you reach.

## This exam is ssh-per-task

Unlike a developer exam, most CKA tasks name a **host**. Read the task's
infobox, ssh to that host from your instance terminal, do the work, and
`exit` back before the next task. The ssh config already carries every
host, as root, no password:

```bash
ssh sim-control-plane     # the main cluster's control plane
ssh cka-worker1           # main workers: cka-worker1 … cka-worker4
ssh cka-aux-sched         # the aux clusters, one per disruptive task:
ssh cka-aux-cni           #   cka-aux-cni, cka-aux-upgrade, cka-aux-etcd
```

`kubectl get nodes` shows the nodes' real names — `sim-worker`,
`sim-worker2` and so on — and those are ssh-able too; the `cka-worker*`
aliases map onto them in order (`cka-worker1` is `sim-worker`). Use the
real name wherever kubectl wants one: drain, taint, label.

Three habits that stop the model costing you points:

- **Aliases do not persist across hosts.** The `k` alias and completion
  you set on the instance are gone on a node. Either re-source them or
  type `kubectl` in full there — do not debug a "broken" alias.
- **`exit` back between tasks.** Running the next task's kubectl on the
  node you forgot to leave targets the wrong cluster, silently.
- **Aux clusters have their own kubeconfig.** From the instance:
  `kubectl --kubeconfig ~/.kube/aux-sched get nodes` (same pattern for
  `aux-cni`, `aux-upgrade`, `aux-etcd`). The default kubeconfig always
  means the main cluster.

## Imperative first, YAML second

Generate the skeleton, then edit. Set this up before the first task:

```bash
alias k=kubectl
source <(kubectl completion bash)
complete -o default -F __start_kubectl k
export do="--dry-run=client -o yaml"
```

The generators cover more of this exam than people expect:

```bash
k create deploy web --image=nginx:1.29-alpine $do > web.yaml
k expose deploy web --port=80 --target-port=8080 $do > svc.yaml
k create role ci --verb=get,list,watch --resource=pods $do > role.yaml
k create rolebinding ci --role=ci --serviceaccount=ns:ci-bot $do > rb.yaml
k create priorityclass high --value=100000 $do > pc.yaml
k autoscale deploy api --min=2 --max=6 --cpu-percent=50 $do > hpa.yaml
k create ingress web --rule='site.local/*=web:80' $do > ing.yaml
k taint nodes <node> <key>=<value>:NoSchedule
k drain <node> --ignore-daemonsets --delete-emptydir-data
```

There is no generator for a Gateway, an HTTPRoute, a NetworkPolicy or a
PersistentVolume. For those, copy the example out of the documentation
once and edit it — never type one from memory.

## Two passes, weight first

- **First pass — an 80-minute sweep.** Attempt every question once, in
  weight order where you can: each task shows its weight, and the heavy
  ones decide the score. Flag anything that resists.
- **Second pass — the rest of the clock on the flagged.** Come back with
  what remains and finish the half-done ones first.
- **Skip after about three minutes stuck.** A question you have not
  started is worth as much as one you have half done, and the next one
  may take two minutes. Note the id and move on.

The draw is stratified to the curriculum, so the weight you sit matches
the published split: Troubleshooting 30%,
Cluster Architecture, Installation and Configuration 25%,
Services and Networking 20%, Workloads and Scheduling 15%, Storage 10%.
Troubleshooting is nearly a third of the score — do not leave it for
the tired end of the sitting.

## The traps that actually cost points

- **The wrong namespace is the most-reported point loss on this exam.**
  If the task names one, work in it, and verify in it. `k config
  set-context --current --namespace=<ns>` sets it once — just remember
  you did it before the next task.
- **`kubectl explain` beats the docs browser.** `k explain
  deploy.spec.strategy --recursive` is generated from the schema of the
  cluster you are on; a browser round-trip costs a minute per visit.
- **An HTTPRoute with a typo in `parentRefs` attaches to nothing, and
  nothing tells you.** No error, no event — the route simply never
  serves. Check `status.parents` on the route before moving on.
- **A `WaitForFirstConsumer` PVC sits Pending until a Pod uses it. That
  is correct behavior**, not a broken claim. Binding happens when the
  first consumer schedules; do not "fix" it.
- **RBAC subresources are not implied.** Granting `deployments` does not
  grant `deployments/scale`; the subresource is its own rule. Verify
  both directions with `k auth can-i --as=system:serviceaccount:...`.
- **An HPA does nothing without CPU requests on the workload.** It reads
  utilization as a percentage of requests; no requests, no scaling, no
  error you will notice under a clock.

## You have root everywhere — including the blast radius

This bank never fences you in. You hold root ssh to every node of every
cluster, the main control plane included, exactly like the real exam's
`sudo -i`. Editing `/etc/kubernetes/manifests`, stopping kubelets and
breaking CoreDNS are all allowed. The flip side is honest: break the
main cluster and every check that reads it fails, which is the score you
earned. If an attempt's board is wrecked, `reset` gives you a fresh
cluster and a new attempt — recovery is one command, not a rule.

## One legacy question, on purpose

The pool includes an etcd backup-and-restore task even though the
Feb-2025 blueprint revision removed etcd from the live exam. It is kept
for full-experience and killer.sh parity, flagged as legacy in its own
text, and runs on its own aux cluster — taking the apiserver down
mid-restore there breaks nothing else you are graded on.
