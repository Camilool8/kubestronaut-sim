#!/usr/bin/env bash
set -euo pipefail

NS=sagitta

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# The seed is one field short of autoscalable, and the missing field is CPU. The
# container declares memory requests and limits and nothing at all for CPU,
# which is the shape a great many real Deployments are in.
#
# Note what is deliberately NOT here: a CPU *limit*. Kubernetes copies a limit
# into the matching request when the request is missing, so a CPU limit on its
# own would have handed the candidate requests.cpu for free and dissolved the
# question. Leaving CPU out of both is what keeps requests.cpu genuinely absent.
#
# replicas is 3, inside the 2..6 the question asks for, so a correct HPA has no
# reason to move it and the graded state stays still. Nothing here depends on a
# scaling event: this cluster runs no metrics-server, so the autoscaler has no
# utilization to read and will not act on one.
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
  namespace: ${NS}
  labels: {app: payments-api}
spec:
  replicas: 3
  selector:
    matchLabels: {app: payments-api}
  template:
    metadata:
      labels: {app: payments-api}
    spec:
      containers:
        - name: api
          image: nginx:1.29-alpine
          ports:
            - name: http
              containerPort: 80
          resources:
            requests:
              memory: 64Mi
            limits:
              memory: 128Mi
EOF

# apply alone is not the reset here. Client-side apply only removes map keys it
# put there itself, so a requests.cpu the candidate added by patching or editing
# is not in the last-applied annotation and would survive — handing the next
# attempt a criterion it had already passed. A strategic merge patch with an
# explicit null deletes the key by name: no positional container index, and a
# no-op when the field is already absent, so a warm re-run neither drifts nor
# rolls the Deployment.
kubectl -n "$NS" patch deploy payments-api --type=strategic -p '{
  "spec": {"template": {"spec": {"containers": [{
    "name": "api",
    "resources": {
      "requests": {"cpu": null, "memory": "64Mi"},
      "limits":   {"cpu": null, "memory": "128Mi"}
    }
  }]}}}
}'

# The HPA is the candidate's to create, so a leftover one from an earlier
# attempt would be free points on the next. setup.sh runs on a cluster CREATE
# and on a training reseed, never on a resume (bootstrap.sh skips the seed
# branch when the cluster was resumed), so this cannot delete work mid-attempt.
kubectl -n "$NS" delete hpa payments-api --ignore-not-found

kubectl -n "$NS" rollout status deploy/payments-api --timeout=180s
