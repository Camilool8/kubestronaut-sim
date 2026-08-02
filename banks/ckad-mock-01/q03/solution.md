# Solution 3

```bash
k -n orbit apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-guard
  namespace: orbit
spec:
  podSelector:
    matchLabels: {role: api}
  policyTypes: [Ingress, Egress]
  ingress:
  - from:
    - podSelector:
        matchLabels: {role: frontend}
    ports:
    - {protocol: TCP, port: 80}
  egress:
  - ports:
    - {protocol: UDP, port: 53}
    - {protocol: TCP, port: 53}
EOF
```

This policy is graded on what it *does*, not on how it is written. The
cluster runs Calico rather than kindnet precisely so NetworkPolicy is
enforced, and four of this question's nine points come from a check that
sends real traffic: frontend must reach api, metrics must not.

So verify it the way the grader does, and the way you would on the real
exam:

```bash
api=$(k -n orbit get pod -l role=api -o jsonpath='{.items[0].status.podIP}')
k -n orbit exec deploy/frontend -- wget -q -T2 -O /dev/null http://$api:80  # should succeed
k -n orbit exec deploy/metrics  -- wget -q -T2 -O /dev/null http://$api:80  # should fail
```

A policy can be shaped perfectly and still allow everything, if its
`podSelector` matches no Pod. Reading the YAML back cannot tell you that;
sending a packet can.
