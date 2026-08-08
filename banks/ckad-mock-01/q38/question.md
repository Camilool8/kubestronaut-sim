Namespace `reticulum` runs Deployments `ledger` (`role=ledger`), `teller`
(`role=teller`) and `auditor` (`role=auditor`). Nothing restricts traffic
between them today: every Pod can reach every other one.

Close the Namespace with a default and then open one path through it.

1. Create a NetworkPolicy named `default-deny-ingress` in Namespace
   `reticulum` that denies **all** ingress to **every** Pod in the
   Namespace. On its own it must allow nothing.
2. Create a second NetworkPolicy named `allow-teller` that permits
   ingress to the `role=ledger` Pods from the `role=teller` Pods, on TCP
   port `80` and nothing else.
3. Neither policy may restrict egress.

When you are done, `teller` must reach `ledger` on port `80` and
`auditor` must not. Prove it rather than reading it back — a request that
a policy denies does not fail, it hangs, so give the client a timeout:

```bash
ip=$(k -n reticulum get pod -l role=ledger -o jsonpath='{.items[0].status.podIP}')
k -n reticulum exec deploy/teller  -- curl -s -m 3 "http://${ip}"
k -n reticulum exec deploy/auditor -- curl -s -m 3 "http://${ip}"
```
