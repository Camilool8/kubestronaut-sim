#!/usr/bin/env bash
set -euo pipefail
cat > /opt/course/18/fixed.yaml <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-report
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: report
              image: busybox:1.37
              command: ["sh", "-c", "echo generating nightly report"]
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: reports
spec:
  ingressClassName: nginx
  rules:
    - host: reports.sim.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: reports
                port:
                  number: 80
EOF
kubectl -n lynx apply -f /opt/course/18/fixed.yaml
kubectl api-resources --api-group=batch -o wide \
  | awk '$0 ~ /[[:space:]]CronJob[[:space:]]/ {print $3; exit}' > /opt/course/18/cronjob-version
