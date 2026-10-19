**On the Gateway listener, with tls.mode: Terminate and certificateRefs** is correct: The listener declares `protocol: HTTPS`, `tls.mode: Terminate` and `certificateRefs` to `kubernetes.io/tls` Secrets. A Secret in another namespace requires a `ReferenceGrant`.

Why the others are wrong:

- **Mounting the certificate as a hostPath in each kube-proxy** — kube-proxy is an L4 forwarder that never terminates TLS; certificates on its nodes would be ignored.
- **Via a tls=true annotation on the Service** — Services carry no TLS configuration; there is no such annotation in the core API.
- **On the HTTPRoute, spec.tls.cert field** — HTTPRoute has no `spec.tls`; certificates belong to the listener, so that many routes can share one termination point.
