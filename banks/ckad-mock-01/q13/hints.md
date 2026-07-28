## Hint 1

Every one of the four requirements is a single top-level key in
`kustomization.yaml`. None of them requires a patch file.

`kubectl kustomize` renders the result without applying it — use it
after every edit rather than at the end.

## Hint 2

`namePrefix`, `labels` (or `commonLabels` on older versions), `images`
with `newTag`, and `replicas` with `name` + `count`.

`resources: [../../base]` has to be there too, or the overlay renders
nothing at all.

Apply with `kubectl -n pavo apply -k /opt/course/13/overlays/staging`.
