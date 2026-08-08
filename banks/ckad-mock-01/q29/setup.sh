#!/usr/bin/env bash
set -euo pipefail
kubectl apply -f - <<'EOF'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: featuretoggles.flags.kubestronaut.dev
spec:
  group: flags.kubestronaut.dev
  scope: Namespaced
  names:
    plural: featuretoggles
    singular: featuretoggle
    kind: FeatureToggle
    shortNames:
      - ft
  versions:
    - name: v1alpha1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          description: A named switch that turns one application feature on or off.
          properties:
            spec:
              type: object
              required:
                - enabled
                - owner
              properties:
                enabled:
                  type: boolean
                  description: Whether the feature is served at all.
                rollout:
                  type: integer
                  minimum: 0
                  maximum: 100
                  description: Percentage of requests the feature is served to.
                owner:
                  type: string
                  description: The team accountable for this toggle.
      additionalPrinterColumns:
        - name: Enabled
          type: boolean
          jsonPath: .spec.enabled
        - name: Rollout
          type: integer
          jsonPath: .spec.rollout
        - name: Owner
          type: string
          jsonPath: .spec.owner
EOF

kubectl wait --for=condition=Established --timeout=120s \
  crd/featuretoggles.flags.kubestronaut.dev

kubectl create ns sextans --dry-run=client -o yaml | kubectl apply -f -

cr=$(mktemp)
cat > "$cr" <<'EOF'
apiVersion: flags.kubestronaut.dev/v1alpha1
kind: FeatureToggle
metadata:
  name: legacy-checkout
  namespace: sextans
spec:
  enabled: false
  rollout: 0
  owner: payments-team
EOF

# Established only says the API is registered; this client's own discovery cache
# can still predate it, so retry rather than fail the seed on a stale mapping.
for _ in $(seq 1 30); do
  kubectl apply -f "$cr" >/dev/null 2>&1 && break
  sleep 2
done
rm -f "$cr"

kubectl get --raw \
  /apis/flags.kubestronaut.dev/v1alpha1/namespaces/sextans/featuretoggles/legacy-checkout \
  >/dev/null
