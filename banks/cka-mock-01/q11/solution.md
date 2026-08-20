# Solution 11

Three small pieces of work on an API this cluster was taught rather than
born with: find what the extension added, read what it accepts, then use it.

## 1. The CRDs of one group

A CustomResourceDefinition is named `<plural>.<group>`, and that is not a
convention — the API server rejects a CRD whose `metadata.name` is anything
else. So every resource a group serves shows up under a name ending in the
group, and filtering the listing is the whole job:

```bash
k get crd
# NAME                                        CREATED AT
# carriers.logistics.sim.dev                  2026-08-19T09:14:02Z
# depots.logistics.sim.dev                    2026-08-19T09:14:02Z
# gatewayclasses.gateway.networking.k8s.io    2026-08-19T08:55:11Z
# gateways.gateway.networking.k8s.io          2026-08-19T08:55:11Z
# ...
# shipments.logistics.sim.dev                 2026-08-19T09:14:02Z
```

That listing is long: this cluster's CNI and its Gateway API controller install
plenty of definitions of their own, which is exactly why the question asks for
one group. Two commands narrow it, from opposite directions:

```bash
k get crd -o name | grep '\.logistics\.sim\.dev$'
# customresourcedefinition.apiextensions.k8s.io/carriers.logistics.sim.dev
# ...

k api-resources --api-group=logistics.sim.dev -o name
# carriers.logistics.sim.dev
# depots.logistics.sim.dev
# shipments.logistics.sim.dev
```

`get crd` lists the definition objects; `api-resources` lists what the API
server currently serves as a result of them. They agree here, and they do not
always: a CRD whose version is `served: false`, or one that has not become
`Established`, exists as an object while serving nothing.

The file wants the names alone, so take the second form, or strip the type
prefix off the first:

```bash
k api-resources --api-group=logistics.sim.dev -o name \
  | sort > /opt/course/11/crds

cat /opt/course/11/crds
# carriers.logistics.sim.dev
# depots.logistics.sim.dev
# shipments.logistics.sim.dev
```

## 2. What a Shipment is made of

`kubectl explain` has no special knowledge of built-in types. It reads the
OpenAPI schema the API server publishes, and a CRD with a structural schema
publishes one just like everything else — descriptions included:

```bash
k explain shipment
# GROUP:      logistics.sim.dev
# KIND:       Shipment
# VERSION:    v1alpha1
#
# DESCRIPTION:
#     Shipment is one load booked into the logistics network.
#
# FIELDS:
#   apiVersion    <string>
#   kind          <string>
#   metadata      <ObjectMeta>
#   spec          <Object>
#   status        <Object>
```

That is the level every object shares, and it says nothing about consignments.
The dotted path walks down:

```bash
k explain shipment.spec > /opt/course/11/shipment-spec
cat /opt/course/11/shipment-spec
# FIELD: spec <Object>
#
# DESCRIPTION:
#     Spec is the desired state of a Shipment - where the load is going,
#     how heavy it is and who is carrying it.
#
# FIELDS:
#   carrier       <Object>
#   destination   <string> -required-
#   priority      <string>
#   weightKg      <integer> -required-
```

Four fields, three of them flat and one an object of its own. Walk into that
one too — the question gave you two values for it:

```bash
k explain shipment.spec.carrier
# FIELDS:
#   contract  <string>
#   name      <string> -required-
```

## 3. The custom resource

Nothing about creating it is special. A custom resource is an ordinary object
in an ordinary manifest, addressed by the group and version the CRD serves:

```bash
k apply -f - <<'EOF'
apiVersion: logistics.sim.dev/v1alpha1
kind: Shipment
metadata:
  name: atlas-7
  namespace: pyxis
spec:
  destination: rotterdam-north
  weightKg: 1200
  priority: express
  carrier:
    name: blue-line
    contract: LOG-2291
EOF
```

`weightKg` is declared an `integer`, so `1200` goes in unquoted; `"1200"` is
refused outright with a type error, which is the friendly failure. Read the
object back — the printer columns the CRD declares make that quick:

```bash
k -n pyxis get shipment
# NAME      DESTINATION       WEIGHT   PRIORITY
# atlas-7   rotterdam-north   1200     express
```

## The failure that is not an error

The unfriendly failure is the one worth carrying away. Write the carrier flat,
as the question's table might tempt you to:

```yaml
spec:
  destination: rotterdam-north
  weightKg: 1200
  carrier: blue-line       # a string, where the schema wants an object
```

and you get a type error, because `carrier` is a field the schema knows. But
invent a field it does not know:

```yaml
spec:
  destination: rotterdam-north
  weightKg: 1200
  contract: LOG-2291       # top-level; the schema has no such field here
  carrier:
    name: blue-line
```

and `kubectl apply` reports success. The object is created, and `contract` is
not in it. A structural schema **prunes** anything it does not declare —
silently, at admission, before the object is ever stored. This is why
`k get -o yaml` on your own object is part of writing a custom resource and
not a formality: the API server does not argue with a field it has never heard
of, it simply drops it.

Two related settings are worth knowing by name. A CRD version can ask for
`x-kubernetes-preserve-unknown-fields: true` on a field to keep whatever is
put there, which is how charts smuggle arbitrary configuration through a
typed API; and `priority` here carries a `default`, which is why a Shipment
that never mentions the field comes back holding `standard`. Defaulting
happens on the way in, so the value is real and stored, not something the
client fills in when reading.
