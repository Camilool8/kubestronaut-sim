#!/usr/bin/env bash
set -euo pipefail
base=/apis/flags.kubestronaut.dev/v1alpha1/namespaces/sextans/featuretoggles

kubectl get crd -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
  | grep '^featuretoggles\.' > /opt/course/29/crd-name

kubectl get --raw "$base" \
  | jq -r '[.items[].metadata.name] | map(select(. != "dark-mode")) | first' \
  > /opt/course/29/existing-toggle

kubectl apply -f - <<'EOF'
apiVersion: flags.kubestronaut.dev/v1alpha1
kind: FeatureToggle
metadata:
  name: dark-mode
  namespace: sextans
spec:
  enabled: true
  rollout: 25
  owner: platform-team
EOF
kubectl get --raw "$base/dark-mode" >/dev/null
