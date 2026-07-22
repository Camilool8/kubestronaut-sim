# Solution 3

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

Note: the simulator's KIND cluster does not enforce NetworkPolicy yet
(default CNI); scoring is spec-based. On the real exam, verify with
`k exec` + `wget -T2` between pods.
