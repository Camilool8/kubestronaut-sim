## Hint 1

Where a Pod ends up is settled by two independent questions, and this task
needs an answer to each. One is asked of the node — is there something on
it that turns Pods away, and does this Pod carry the matching permission?
The other is asked of the Pod — is it merely *allowed* on that node, or is
it *obliged* to be there? Answer only the first and the Pods stay free to
scatter across the cluster; answer only the second and they never start at
all.

Before adding anything, find what is deciding the placement right now.
It is one field in each Pod template, and `-o wide` on the Pods shows you
what that field did.

## Hint 2

The node half is two commands, not one: `kubectl taint nodes --help` and
`kubectl label nodes --help` each print the exact spelling they want, and
writing a taint does not create a label of the same name.

The Pod half is two fields: `kubectl explain pod.spec.tolerations` and
`kubectl explain pod.spec.affinity.nodeAffinity` list everything
`batch-runner` is missing. Read the two long field names under
`nodeAffinity` and pick deliberately between them — one of the two is a
preference the scheduler may ignore.

Then look again at the field that is already in the template. Constraints
on where a Pod may run are combined with AND, never OR, so a new one
placed beside the old one describes a node that does not exist — and the
replacement Pods sit `Pending` with nowhere to go.
