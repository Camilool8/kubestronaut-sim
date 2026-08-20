#!/usr/bin/env bash
set -euo pipefail

NS=pyxis
GROUP=logistics.sim.dev

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# Three CRDs in one group, so that "list the CRDs of this group" is a filter
# rather than a single name — and so that a candidate who dumps every CRD in the
# cluster (the Gateway API addon alone contributes several) is visibly wrong.
# The schemas carry descriptions on purpose: kubectl explain has nothing to print
# for a CRD that ships none, and the question is graded on that output.
kubectl apply -f - <<EOF
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: shipments.${GROUP}
spec:
  group: ${GROUP}
  scope: Namespaced
  names:
    plural: shipments
    singular: shipment
    kind: Shipment
    listKind: ShipmentList
  versions:
    - name: v1alpha1
      served: true
      storage: true
      subresources:
        status: {}
      additionalPrinterColumns:
        - name: Destination
          type: string
          jsonPath: .spec.destination
        - name: Weight
          type: integer
          jsonPath: .spec.weightKg
        - name: Priority
          type: string
          jsonPath: .spec.priority
      schema:
        openAPIV3Schema:
          type: object
          description: Shipment is one load booked into the logistics network.
          properties:
            spec:
              type: object
              description: >-
                Spec is the desired state of a Shipment - where the load is
                going, how heavy it is and who is carrying it.
              required:
                - destination
                - weightKg
                - carrier
              properties:
                destination:
                  type: string
                  description: Destination is the code of the depot this load is bound for.
                weightKg:
                  type: integer
                  minimum: 1
                  description: WeightKg is the gross weight of the load in whole kilograms.
                priority:
                  type: string
                  enum:
                    - standard
                    - express
                  default: standard
                  description: Priority is the service level this load is booked at.
                carrier:
                  type: object
                  description: Carrier is the haulier that accepted this load.
                  required:
                    - name
                  properties:
                    name:
                      type: string
                      description: Name is the haulier the load was booked with.
                    contract:
                      type: string
                      description: Contract is the framework agreement the booking falls under.
            status:
              type: object
              description: Status is the observed state of a Shipment.
              properties:
                phase:
                  type: string
                  description: Phase is how far along the network this load has got.
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: carriers.${GROUP}
spec:
  group: ${GROUP}
  scope: Namespaced
  names:
    plural: carriers
    singular: carrier
    kind: Carrier
    listKind: CarrierList
  versions:
    - name: v1alpha1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          description: Carrier is a haulier the network books loads with.
          properties:
            spec:
              type: object
              description: Spec is the desired state of a Carrier.
              required:
                - contact
              properties:
                contact:
                  type: string
                  description: Contact is where the network reaches this haulier.
                fleetSize:
                  type: integer
                  description: FleetSize is how many vehicles this haulier runs.
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: depots.${GROUP}
spec:
  group: ${GROUP}
  scope: Namespaced
  names:
    plural: depots
    singular: depot
    kind: Depot
    listKind: DepotList
  versions:
    - name: v1alpha1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          description: Depot is a site loads are moved between.
          properties:
            spec:
              type: object
              description: Spec is the desired state of a Depot.
              required:
                - code
              properties:
                code:
                  type: string
                  description: Code is the short name loads are addressed to.
                region:
                  type: string
                  description: Region is the operating area this site belongs to.
EOF

kubectl wait --for=condition=Established --timeout=90s \
  "crd/shipments.${GROUP}" "crd/carriers.${GROUP}" "crd/depots.${GROUP}"

# A CR of a just-created CRD can be rejected while this container's discovery
# cache still predates the group. kubectl resets that cache and retries by
# itself, so this loop is only the belt to that braces — and the last attempt is
# left un-suppressed so a real schema error still surfaces in the setup log.
attempt=1
until kubectl apply -f - <<EOF
apiVersion: ${GROUP}/v1alpha1
kind: Carrier
metadata:
  name: blue-line
  namespace: ${NS}
spec:
  contact: dispatch@blue-line.example
  fleetSize: 42
---
apiVersion: ${GROUP}/v1alpha1
kind: Depot
metadata:
  name: rotterdam-north
  namespace: ${NS}
spec:
  code: rotterdam-north
  region: benelux
EOF
do
  attempt=$((attempt + 1))
  [ "$attempt" -le 5 ] || exit 1
  sleep 3
done

# The candidate creates the Shipment, so re-seeding this question means handing
# back a Namespace with none: a leftover from a previous attempt would be graded
# as this one's work.
kubectl -n "$NS" delete shipment --all --wait >/dev/null 2>&1 || true
