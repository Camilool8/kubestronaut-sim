## Hint 1

A transformer changes one well-known thing across every resource. A patch
changes anything at all, in one named resource, and that is why this
question needs one.

The key is plural, and each entry is either a fragment of the object you
want merged in, or a file holding one. `kubectl kustomize` renders the
result without applying it — run it after every edit.

## Hint 2

Under `patches:`, an entry with `patch: |` and an inline document is
enough; the document needs `apiVersion`, `kind` and
`metadata.name` so kustomize knows which resource it belongs to.

Everything below that is merged into the base, so write only the fields
you are changing. Lists of containers merge on the container's `name`
field, so name the container and give it just the `env` entry and the one
probe field.

Apply with `kubectl -n norma apply -k /opt/course/35/overlays/prod`.
