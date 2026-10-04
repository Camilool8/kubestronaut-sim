**Configure an Egress Gateway** is correct: Egress gateways concentrate egress on specific nodes/IPs: in Cilium, a `CiliumEgressGatewayPolicy` SNATs to the egressIP of a gateway node; in Istio, traffic leaves through the mesh's egress gateway. Without it, the egress IP is whatever node the pod runs on.

Why the others are wrong:

- **Enlarge the pod CIDR** — the size of the pod range says nothing about which address the outside world sees; egress still leaves SNATed to whichever node the pod is on.
- **Use hostPort on the pods** — hostPort exposes a container port on its node for inbound traffic; it does not change the source address of outbound connections.
- **Switch the Service to ExternalName** — ExternalName is a DNS alias for an external name; it affects how a pod resolves a target, not what address the target sees.
