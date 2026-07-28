## Hint 1

A NetworkPolicy that names both `Ingress` and `Egress` in
`policyTypes` denies everything in that direction which it does not
explicitly allow. That is what makes task 4 automatic rather than
something you write.

DNS is UDP *and* TCP — both, or name resolution breaks intermittently in
a way that is very hard to debug.

## Hint 2

`spec.podSelector` selects who the policy applies to; `from`/`to`
select the other end. They are different fields and mixing them up is
the classic mistake.

For egress DNS, an empty `to` with only `ports` allows those ports
anywhere, which is what you want here.

Test it: `kubectl -n orbit exec deploy/frontend -- wget -q -T 5 -O-
http://api` should work and the same from `deploy/metrics` should hang.
