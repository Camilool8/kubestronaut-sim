## Hint 1

Two objects, and only one of them is new. The autoscaler is the obvious
half; the other half is a single field on a container that already
exists, and the question tells you why it matters.

Think about what "50 % CPU" is 50 % **of**. A percentage needs something
underneath it, and for a Pod that something is declared, not measured.

For the autoscaler itself, there is a generator, and it is worth using —
but read its output before you apply it. Three of the four settings in
the table are there; the fourth has no flag on the command at all, so
that one is yours to add.

## Hint 2

`kubectl set resources` changes a container's requests in place without
opening an editor; it takes `--containers` to pick the one you mean and
`--requests` as `name=quantity`. Whichever way you do it, the field has
to land in the Deployment's Pod template; editing a live Pod is not the
route.

The missing setting lives at
`spec.behavior.scaleDown.stabilizationWindowSeconds`, and
`kubectl explain hpa.spec.behavior --recursive` will show you the whole
block. There is no `behavior` in `autoscaling/v1`, so whatever you
generate has to end up as an `autoscaling/v2` manifest before that field
means anything.

Two notes on the generator while you are there. `--cpu-percent` is
deprecated in favour of `--cpu`, which reads `50%` and `500m` as
different kinds of target. And in v2 the percentage is not a top-level
field: it is one entry in `spec.metrics`, of `type: Resource`, naming
`cpu`, with a `target` whose own `type` decides whether the number is a
percentage or an absolute quantity.
