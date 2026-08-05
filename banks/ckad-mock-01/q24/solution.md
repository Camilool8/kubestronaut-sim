# Solution 24

Read the Pod you are replacing before writing anything — the container
name and command are part of the answer and are already on the cluster:

```bash
k -n auriga get pod report-runner -o json | jq '.spec.containers'
```

Then write the Deployment. `spec.template.spec` is a Pod spec, so
everything you just read goes straight into it:

```bash
k -n auriga apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: report-runner
  namespace: auriga
spec:
  replicas: 3
  selector:
    matchLabels:
      app: report-runner
  template:
    metadata:
      labels:
        app: report-runner
    spec:
      containers:
        - name: report
          image: busybox:1.37
          command: ["sh", "-c", "while true; do echo 'report-runner: nothing to do'; sleep 15; done"]
          securityContext:
            runAsUser: 1000
            runAsNonRoot: true
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
            seccompProfile:
              type: RuntimeDefault
EOF

k -n auriga rollout status deploy/report-runner --timeout=180s
k -n auriga delete pod report-runner
```

Delete the bare Pod **last**. It is the only copy of the spec you are
working from, and until the Deployment's replicas are Ready it is also
the only thing running the workload.

## Why a Deployment rather than a Pod

A bare Pod has no controller. Nothing recreates it when its node is
drained, cordoned or lost; `kubectl rollout` has nothing to act on, so
there is no versioned history, no rollback and no way to change the image
without deleting and recreating by hand. A Deployment owns a ReplicaSet,
the ReplicaSet owns the Pods, and every one of those problems belongs to
the controller instead of to you.

The selector is the one part that is not simply copied down from the Pod.
`spec.selector.matchLabels` is how the ReplicaSet finds its Pods and
`spec.template.metadata.labels` is what goes on them; if they disagree
the API server rejects the Deployment outright, which is a good error to
have met once.

## The five settings, and where each may live

| Field | Pod securityContext | Container securityContext |
|---|---|---|
| `runAsUser`, `runAsNonRoot` | yes | yes |
| `seccompProfile` | yes | yes |
| `allowPrivilegeEscalation` | **no** | yes |
| `capabilities` | **no** | yes |

Putting the last two at Pod level is rejected by the API, so you find out
straight away. Putting the first three at Pod level is fine and often
better: they then apply to every container, including ones added later.

`runAsUser: 1000` and `runAsNonRoot: true` are not the same instruction.
The first says which UID to use. The second refuses to start the
container at all if it would end up as UID 0 — including the case where
someone rebuilds the image tomorrow with `USER root` and nobody notices.

## seccomp, and how it differs from capabilities

Capabilities split root's powers into pieces and decide which of them a
privileged system call may use. seccomp works one level out: it decides
which system calls the kernel will accept from the process **at all**.

`RuntimeDefault` asks for the container runtime's own curated profile —
containerd and CRI-O both ship one that blocks a few dozen calls no
normal application makes. Without the field the Pod runs `Unconfined`,
with the whole system-call surface available. It is the cheapest of the
five settings to adopt and the one most often left out, which is why Pod
Security's `baseline` and `restricted` levels both look for it.

```bash
k -n auriga get deploy report-runner \
  -o jsonpath='{.spec.template.spec.containers[0].securityContext}' | jq .
```
