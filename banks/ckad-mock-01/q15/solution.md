# Solution 15

**1. The ServiceAccount:**

```bash
k -n phoenix create serviceaccount pipeline-runner
```

**2. A Deployment that runs as it.** The field is `serviceAccountName` in
the **Pod template** — not on the Deployment itself:

```bash
k -n phoenix apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pipeline
  namespace: phoenix
spec:
  replicas: 1
  selector:
    matchLabels: {app: pipeline}
  template:
    metadata:
      labels: {app: pipeline}
    spec:
      serviceAccountName: pipeline-runner
      containers:
        - name: runner
          image: nginx:1.29-alpine
EOF
k -n phoenix rollout status deploy pipeline
```

**3. A Pod with no token:**

```bash
k -n phoenix apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: no-token
  namespace: phoenix
spec:
  automountServiceAccountToken: false
  containers:
    - name: web
      image: nginx:1.29-alpine
EOF
```

Check what actually happened inside, not just what you asked for:

```bash
k -n phoenix exec no-token -c web -- ls /var/run/secrets/kubernetes.io/serviceaccount
# ls: ...: No such file or directory      <- correct

k -n phoenix exec deploy/pipeline -- ls /var/run/secrets/kubernetes.io/serviceaccount
# ca.crt  namespace  token                <- for comparison
```

**4. Request a token:**

```bash
k -n phoenix create token pipeline-runner --duration=1h \
  > /opt/course/15/pipeline-token
cat /opt/course/15/pipeline-token
```

## Where tokens come from now

Before Kubernetes 1.24, creating a ServiceAccount also created a
long-lived Secret holding a token that never expired, and you fetched it
with `k get secret`. That stopped: tokens are now short-lived, obtained
on demand, and projected into Pods by the kubelet, which refreshes them
before they expire.

So `k get secret` will not find one, and looking for it is the most
common way to get stuck on this. `kubectl create token <sa>` is the
replacement. Without `--duration` you get the cluster default — an hour
on most clusters, but relying on that when the question names a duration
is a bet you do not need to take.

A long-lived token is still possible by creating a Secret of type
`kubernetes.io/service-account-token` annotated with the ServiceAccount's
name. It is deliberately awkward now, because a credential that never
expires is a liability.

## Two places automounting is controlled

`automountServiceAccountToken` exists on both the **Pod** and the
**ServiceAccount**. The Pod's setting wins. Setting it on the
ServiceAccount is the better default when nothing using that account
needs API access; setting it on the Pod, as here, is the targeted
version.
