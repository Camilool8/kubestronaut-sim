## Hint 1

A CustomResourceDefinition is itself an ordinary cluster-scoped object,
so the verb you would use on any other resource type lists them. The
name you want is not the kind: it is assembled from two other fields on
the same object.

Once the type is registered, everything you already know works on it —
including the command that describes fields, because the schema arrived
with the definition rather than being compiled into `kubectl`.

## Hint 2

`kubectl get crd` prints the names in exactly the form task 1 asks for.
`kubectl get crd <name> -o jsonpath` over `.spec.group`,
`.spec.versions[*].name` and `.spec.names.plural` gives you the three
pieces the manifest needs.

For task 3, `kubectl explain featuretoggle.spec --recursive` lists the
fields and their types, and note that `rollout` is a number rather than
a string. A manifest's `apiVersion` is `<group>/<version>`.
