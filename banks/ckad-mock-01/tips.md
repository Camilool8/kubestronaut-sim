Two hours is not long. Most people who fail this exam knew the answers —
they ran out of time getting to them. What follows is technique, not
Kubernetes: the habits that decide how many of the seventeen you reach.

## Set the terminal up before you start

The exam desktop already has these, and it is worth spending ninety
seconds confirming them rather than discovering halfway through that you
have been typing `kubectl` in full.

```bash
alias k=kubectl
source <(kubectl completion bash)
complete -o default -F __start_kubectl k
```

Tab completion is the part that matters. It completes resource types,
resource *names*, and namespaces — so `k -n ` then Tab is faster and more
reliable than remembering which namespace a question named.

Two more that pay for themselves:

```bash
export do="--dry-run=client -o yaml"
export now="--grace-period 0 --force"
```

`$do` turns any generator into a manifest you can edit. `$now` deletes a
Pod immediately instead of waiting out its termination grace period,
which is thirty seconds you do not have.

## Never write a manifest from memory

Generate the skeleton, then edit it. This is the single biggest time
saving available, and it also removes a whole class of typos.

```bash
k create deploy web --image=nginx:1.29-alpine $do > web.yaml
k run tmp --image=busybox:1.37 $do --command -- sleep 3600 > pod.yaml
k create job report --image=busybox:1.37 $do -- sh -c 'echo done' > job.yaml
k create cj nightly --image=busybox:1.37 --schedule='0 2 * * *' $do -- sh -c 'echo done' > cj.yaml
k expose deploy web --port=80 --target-port=8080 $do > svc.yaml
k create cm app-config --from-literal=LOG_LEVEL=debug $do > cm.yaml
k create secret generic db --from-literal=password=hunter2 $do > secret.yaml
k create ingress web --rule='site.local/*=web:80' $do > ing.yaml
```

There is no generator for a few things you will be asked for —
NetworkPolicy, PersistentVolumeClaim, a multi-container Pod. For those,
generate the nearest thing that does exist and add to it, or start from
a document you already have on the cluster.

## The docs are the last resort, not the first

Reaching for a browser costs a minute even when you find the page
immediately. Three faster sources, in order:

```bash
k explain pod.spec.containers.securityContext
k explain deploy.spec.strategy --recursive
k create deploy -h
```

`explain` is authoritative for **field names and structure** — it is
generated from the same schema the API server validates against, so it
cannot be out of date with the cluster you are on. `--recursive` prints
the whole subtree at once, which is usually what you actually wanted.

`-h` on a command shows its examples, and the examples are the fastest
path to a flag you half-remember. `k create secret generic -h` answers
"was it `--from-literal` or `--from-file`" in a second.

When you do open the documentation, go straight to a page you can search
inside rather than using the site search: the concept pages carry the
YAML examples, and copying one and editing it beats typing one.

## Read what is there before you change it

Almost every question in a hands-on exam operates on something the
cluster already has. Look at it first.

```bash
k -n <ns> get all
k -n <ns> get pod <name> -o yaml
k -n <ns> describe pod <name>
k -n <ns> get pod <name> -o jsonpath='{.spec.containers[*].image}'
```

`describe` is for **events** — scheduling failures, image pull errors,
probe failures, the reason a Pod is Pending. `-o yaml` is for the spec.
`-o jsonpath` is for pulling one field out without reading a hundred
lines, and it is the fastest way to check your own answer:

```bash
k -n volans get deploy edge-cache \
  -o jsonpath='{range .spec.template.spec.containers[*]}{.name}{"\t"}{.imagePullPolicy}{"\n"}{end}'
```

Editing something that exists is usually faster than replacing it:

```bash
k -n <ns> edit deploy <name>
k -n <ns> patch deploy <name> --type=merge -p '{"spec":{"replicas":3}}'
k -n <ns> set image deploy/<name> web=nginx:1.29-alpine
k -n <ns> scale deploy <name> --replicas=3
```

## YAML in a terminal editor

Most lost points in a written exam are indentation. Configure the editor
once, at the start:

```vim
:set expandtab shiftwidth=2 tabstop=2
:set number
```

`expandtab` is the important one — a literal tab character is not valid
YAML indentation, and the error it produces points at a line that looks
correct. If the editor inserts one anyway, `:set list` shows it.

Two editing moves worth having:

- **Indent a block**: select it in visual mode (`V`, then `j` to extend),
  then `>` to shift right or `<` to shift left. Repeat with `.`.
- **Yank a block**: `yy` copies a line, `3yy` copies three, `p` pastes
  below. A container block is usually a copy of the one above it with two
  fields changed.

And validate before you believe it:

```bash
k apply -f pod.yaml --dry-run=server
```

Server-side dry run catches what client-side does not: an invalid field
name, a value the API rejects, a securityContext setting that is not
legal where you put it.

## Pacing

The clock is the exam. Two rules:

**Do not finish a question you are stuck on.** If you have not made
progress in a few minutes, note the id, leave what you have and move on.
A question you have not started is worth the same as one you have half
done, and the one after it may take two minutes. Come back with whatever
time is left.

**Do exactly what is asked, and nothing else.** Extra labels, tidier
names and a Service the question did not mention cost time and can only
lose points. If a question names a Namespace, work in it; if it names a
file path, write to it exactly.

Verify each answer as you finish it, in one command, then leave it alone:

```bash
k -n <ns> get pod <name>
k -n <ns> rollout status deploy/<name> --timeout=60s
```

## When something will not start

The order to look, and it is almost always answered in the first two:

```bash
k -n <ns> get pod                       # Pending? CrashLoopBackOff? ImagePullBackOff?
k -n <ns> describe pod <name>           # events at the bottom
k -n <ns> logs <name>                   # the container's own output
k -n <ns> logs <name> --previous        # the output of the one that already died
```

`--previous` is the one people forget. A container in
`CrashLoopBackOff` has no current output worth reading; what killed it is
in the previous container's log.

| Symptom | Usually |
|---|---|
| `Pending` | Nothing can schedule it: resource requests too large, a node selector that matches nothing, an unbound PVC |
| `ImagePullBackOff` | Wrong tag, wrong registry, or a pull policy that will not use the local copy |
| `CrashLoopBackOff` | The process exits. Read `--previous`; a readOnlyRootFilesystem or a dropped capability is a common cause |
| `Running` but not `Ready` | The readiness probe is failing. `describe` says which |
| `CreateContainerConfigError` | A ConfigMap or Secret the container reads as **env** does not exist. Mounted as a **volume** instead, the same missing object leaves the Pod in `ContainerCreating` with a `FailedMount` event |

## Shell habits

- `Ctrl+R` searches your command history. You will run variations of the
  same `kubectl get` fifty times; retyping them is minutes.
- `Ctrl+Z` suspends the editor, `fg` brings it back. Faster than closing
  and reopening a file to run one command.
- `!!` repeats the last command; `sudo !!` repeats it with sudo.
- Set the namespace once instead of typing `-n` every time:
  `k config set-context --current --namespace=<ns>`. Just remember you
  did it before the next question.
