## Hint 1

Policies do not override one another and there is no ordering between
them. Every policy that selects a Pod contributes what it allows, and the
Pod ends up permitting the union of those allowances — so a second policy
can only ever widen the first, never narrow it.

That is what makes the pair work. One of them selects everything and
allows nothing; the other selects one workload and allows one thing.

## Hint 2

The first policy needs a selector that matches every Pod in the
Namespace, a declaration that it governs ingress, and no rules at all.
An empty selector is written `{}`; a rule list that is absent is what
"allows nothing" looks like. Watch what happens if you write an empty
*rule* instead of an empty *list* — that allows everything.

The second is one rule with both halves present: who may connect, and on
which port. Leave the port list out and the rule opens every port on
those Pods.

Neither policy should name the outbound direction anywhere.
