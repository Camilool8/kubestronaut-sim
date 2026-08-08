# Solution 38

## The default

```bash
k -n reticulum apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: reticulum
spec:
  podSelector: {}
  policyTypes: [Ingress]
EOF
```

Three things do the work, and each is easy to write slightly wrong:

- `podSelector: {}` selects **every** Pod in the Namespace. An empty
  selector is the widest one, not the narrowest.
- `policyTypes: [Ingress]` is what turns the Pods it selects from
  unrestricted into deny-by-default inbound. A direction that is not
  listed here is left completely alone no matter what is written below.
- **No `ingress:` key at all.** That is the deny.

`ingress: []` means the same thing. `ingress: [{}]` does not — that is
one rule with no restrictions, which allows everything from everywhere,
and it is the classic way to ship a default-deny that denies nothing.

## The exception

```bash
k -n reticulum apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-teller
  namespace: reticulum
spec:
  podSelector:
    matchLabels: {role: ledger}
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: {role: teller}
      ports:
        - {protocol: TCP, port: 80}
EOF
```

## Verify

```bash
ip=$(k -n reticulum get pod -l role=ledger -o jsonpath='{.items[0].status.podIP}')

k -n reticulum exec deploy/teller  -- curl -s -m 3 "http://${ip}"
# ledger-ok

k -n reticulum exec deploy/auditor -- curl -s -m 3 "http://${ip}"
# (nothing, then exit status 28)
```

Use a timeout on both. A denied packet is dropped, not refused, so the
client waits for a handshake that will never be answered — without `-m`
the second command sits there for over two minutes and tells you nothing
you did not already suspect.

## Why two policies and not one

They compose by union, and nothing about the order they were created in
matters:

- Selecting a Pod with **any** policy that names a direction flips that
  Pod to deny-by-default in that direction.
- Every policy selecting that Pod then contributes its allowances.
- The Pod permits the union. There is no `deny` rule in the API, and no
  precedence to reason about.

So `default-deny-ingress` closes the whole Namespace and `allow-teller`
reopens exactly one path, and the pair can be read separately. Delete
`allow-teller` and the Namespace is shut again; add a third policy and it
can only ever open more.

This is also why a default-deny is worth writing as its own object rather
than folding it into the workload's policy. It states the Namespace's
posture in four lines that never change, and every later policy is an
exception you can read in isolation.

## Egress is untouched

Neither policy names `Egress` in `policyTypes`, so outbound traffic —
including DNS — is unrestricted for every Pod here. Adding `Egress` to
the default-deny is the other classic mistake: it is a defensible thing
to want, but it breaks name resolution instantly, and the symptom looks
like a broken application rather than a policy.

## Reading a policy that is not working

```bash
k -n reticulum get netpol
k -n reticulum describe netpol allow-teller
k -n reticulum get pod --show-labels
```

The last one settles most of it. A policy whose `podSelector` matches
nothing does not fail and does not warn — it simply never applies, which
leaves its Pods unrestricted rather than protected, and the traffic that
should have been denied flows perfectly.
