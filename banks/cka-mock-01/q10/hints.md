## Hint 1

All three requirements are single top-level keys in the overlay's
`kustomization.yaml`. Nothing here needs a patch file.

Building an overlay costs nothing and changes nothing, so run
`kubectl kustomize` on it after every edit instead of waiting until the
end — and remember that a build is not an apply.

## Hint 2

The image and the replica count are the `images` key (`name` plus
`newTag`) and the `replicas` key (`name` plus `count`). Both match on
what the **base** calls the thing, not on the full image reference.

The label is the `labels` key, or the older `commonLabels`. Watch where
it lands: `kubectl kustomize` on your overlay shows you exactly which
parts of the Deployment the pair reached, and a Pod is not one of the
resources in the build — its labels come from the Deployment's
`spec.template.metadata.labels`, which the transformer only writes when
you ask it to.
