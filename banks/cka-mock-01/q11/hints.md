## Hint 1

A CRD's name is always its plural joined to its group, so the group is a
suffix you can filter on:

```bash
k get crd
```

This cluster serves custom resources that have nothing to do with logistics,
so the whole listing is the wrong answer — and the file wants the names, not
the table around them.

`kubectl explain` is not only for built-in resources. It reads whatever schema
a CRD published, and it takes a dotted path: the level you are asked for is one
below the resource itself.

Nothing tells you what a `Shipment` is made of except that schema. Read it
before you write any YAML.

## Hint 2

`kubectl get crd -o name` prints `customresourcedefinition.apiextensions.k8s.io/<name>`;
`kubectl api-resources --api-group=logistics.sim.dev -o name` prints the bare
names. Either way, redirect the result to the file.

`kubectl explain shipment.spec > /opt/course/11/shipment-spec`. Follow it with
`kubectl explain shipment.spec.carrier` for yourself — two of the four values
you were given live under one field, and the path is how you walk into it.

The custom resource is an ordinary manifest:
`apiVersion: logistics.sim.dev/v1alpha1`, `kind: Shipment`, a `metadata.name`,
and a `spec` shaped the way `explain` just described. One of the values is a
number rather than a string, and one is only accepted from a short list of
words. A field the schema does not know is not an error — it is quietly
dropped, so read the object back after you create it.
