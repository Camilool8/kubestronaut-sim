#!/usr/bin/env bash
set -euo pipefail
# limits.conf is delivered to the instance by q06/files/ (the instance
# entrypoint copies it into /opt/course/6). Nothing to seed in-cluster
# beyond the Namespace.
kubectl create ns atlas --dry-run=client -o yaml | kubectl apply -f -
