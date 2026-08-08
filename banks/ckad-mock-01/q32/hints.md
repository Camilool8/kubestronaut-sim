## Hint 1

There is a single `kubectl` subcommand for exactly this, and it sits
beside the ones for watching, pausing and undoing a Deployment's
rollouts. `kubectl rollout -h` lists it.

Requirement 3 rules out the obvious workarounds — bumping the image tag
and putting it back, or scaling to zero and back up.

## Hint 2

`rollout restart` is the subcommand, and it takes a Deployment the same
way `rollout status` does.

It works by writing a timestamp annotation into
`spec.template.metadata.annotations`, which is a Pod-template change like
any other, so it triggers a normal rolling update. Read it back to see
what it did:

```bash
k -n sagitta get deploy session-store \
  -o jsonpath='{.spec.template.metadata.annotations}'
```
